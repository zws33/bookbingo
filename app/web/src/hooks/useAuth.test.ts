import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useAuth } from './useAuth';

vi.mock('../lib/auth', () => ({
  subscribeToAuthState: vi.fn(),
}));

vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToAuthState } from '../lib/auth';

const mockSubscribe = vi.mocked(subscribeToAuthState);

type Handlers = {
  onData: (user: User | null) => void;
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

const ada = { uid: 'user-1', displayName: 'Ada' } as User;

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useAuth', () => {
  it('starts in loading state before the first auth callback', () => {
    captureHandlers();

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the signed-in user emitted by the auth listener', () => {
    const { handlers } = captureHandlers();

    const { result } = renderHook(() => useAuth());

    act(() => handlers.onData(ada));

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(ada);
    expect(result.current.error).toBeUndefined();
  });

  it('resolves to a signed-out state when the auth listener emits null', () => {
    const { handlers } = captureHandlers();

    const { result } = renderHook(() => useAuth());

    act(() => handlers.onData(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces auth listener errors and stops loading', () => {
    const { handlers } = captureHandlers();

    const { result } = renderHook(() => useAuth());
    const error = new Error('auth/internal-error');

    act(() => handlers.onError(error));

    expect(result.current.error).toBe(error);
    expect(result.current.user).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later auth state arrives', () => {
    const { handlers } = captureHandlers();

    const { result } = renderHook(() => useAuth());

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData(ada));

    expect(result.current.error).toBeUndefined();
    expect(result.current.user).toEqual(ada);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();

    const { unmount } = renderHook(() => useAuth());
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
