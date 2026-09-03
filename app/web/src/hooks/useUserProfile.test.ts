import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserProfile } from './useUserProfile';
import type { UserProfile } from '../types';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/userProfile', () => ({
  subscribeToUserProfile: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToUserProfile } from '../data/userProfile';

const mockSubscribe = vi.mocked(subscribeToUserProfile);

/** Callbacks handed to subscribeToUserProfile by the most recent call. */
type Handlers = {
  onData: (profile: UserProfile | undefined) => void;
  onError: (error: Error) => void;
};

function captureHandlers(): {
  handlers: Handlers;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const unsubscribe = vi.fn();
  const handlers = {} as Handlers;
  mockSubscribe.mockImplementation((_userId, onData, onError) => {
    handlers.onData = onData;
    handlers.onError = onError;
    return unsubscribe;
  });
  return { handlers, unsubscribe };
}

const ada: UserProfile = { id: 'user-1', name: 'Ada' };

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useUserProfile', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useUserProfile('user-1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.profile).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the profile emitted by the subscription', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUserProfile('user-1'));

    act(() => handlers.onData(ada));

    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toEqual(ada);
    expect(result.current.error).toBeUndefined();
  });

  it('stops loading with no profile when the document is missing', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUserProfile('ghost'));

    act(() => handlers.onData(undefined));

    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUserProfile('user-1'));

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.profile).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUserProfile('user-1'));

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData(ada));

    expect(result.current.error).toBeUndefined();
    expect(result.current.profile).toEqual(ada);
  });

  it('does not subscribe and stays empty when userId is blank', () => {
    captureHandlers();
    const { result } = renderHook(() => useUserProfile(''));
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(result.current.profile).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useUserProfile('user-1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('resubscribes when userId changes', () => {
    const { unsubscribe } = captureHandlers();
    const { rerender } = renderHook(({ id }) => useUserProfile(id), {
      initialProps: { id: 'user-1' },
    });
    rerender({ id: 'user-2' });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenLastCalledWith(
      'user-2',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
