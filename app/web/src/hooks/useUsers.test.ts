import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUsers } from './useUsers';
import type { UserProfile } from '../types';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/users', () => ({
  subscribeToUsers: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToUsers } from '../data/users';

const mockSubscribe = vi.mocked(subscribeToUsers);

/** Callbacks handed to subscribeToUsers by the most recent call. */
type Handlers = {
  onData: (users: UserProfile[]) => void;
  onError: (error: Error) => void;
};

function captureHandlers(): {
  handlers: Handlers;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const unsubscribe = vi.fn();
  const handlers = {} as Handlers;
  mockSubscribe.mockImplementation((onData, onError) => {
    handlers.onData = onData;
    handlers.onError = onError;
    return unsubscribe;
  });
  return { handlers, unsubscribe };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return { id: 'user-0', name: 'Ada', ...overrides };
}

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useUsers', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useUsers());
    expect(result.current.loading).toBe(true);
    expect(result.current.users).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes users emitted by the subscription', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUsers());

    const user = makeUser({ id: 'user-1', name: 'Grace' });
    act(() => handlers.onData([user]));

    expect(result.current.loading).toBe(false);
    expect(result.current.users).toEqual([user]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUsers());

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.users).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useUsers());

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData([makeUser()]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.users).toHaveLength(1);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useUsers());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('subscribes once across rerenders', () => {
    captureHandlers();
    const { rerender } = renderHook(() => useUsers());
    rerender();
    rerender();
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });
});
