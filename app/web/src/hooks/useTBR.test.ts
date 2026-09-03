import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TBREntry } from '@bookbingo/lib-types';
import { useTBR } from './useTBR';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/tbr', () => ({
  subscribeToTBR: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToTBR } from '../data/tbr';

const mockSubscribe = vi.mocked(subscribeToTBR);

/** Callbacks handed to subscribeToTBR by the most recent call. */
type Handlers = {
  onData: (entries: TBREntry[]) => void;
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

function makeEntry(overrides: Partial<TBREntry> = {}): TBREntry {
  return {
    id: 'tbr-0',
    bookId: 'book-1',
    plannedTiles: ['sci-fi'],
    addedAt: new Date('2026-02-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useTBR', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useTBR('user-1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes entries emitted by the subscription', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useTBR('user-1'));

    const entry = makeEntry({ id: 'tbr-1', bookId: 'book-1' });
    act(() => handlers.onData([entry]));

    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useTBR('user-1'));

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useTBR('user-1'));

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData([makeEntry()]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.entries).toHaveLength(1);
  });

  it('does not subscribe and stays empty when userId is blank', () => {
    captureHandlers();
    const { result } = renderHook(() => useTBR(''));
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useTBR('user-1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('resubscribes when userId changes', () => {
    const { unsubscribe } = captureHandlers();
    const { rerender } = renderHook(({ id }) => useTBR(id), {
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
