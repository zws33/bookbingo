import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Reading } from '@bookbingo/lib-types';
import { useAllReadings } from './useAllReadings';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/readings', () => ({
  subscribeToAllReadings: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToAllReadings } from '../data/readings';

const mockSubscribe = vi.mocked(subscribeToAllReadings);

/** Callbacks handed to subscribeToAllReadings by the most recent call. */
type Handlers = {
  onData: (readingsByUser: Map<string, Reading[]>) => void;
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

function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'doc-0',
    bookId: 'book-1',
    tiles: ['sci-fi'],
    isFreebie: false,
    readAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useAllReadings', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useAllReadings());
    expect(result.current.loading).toBe(true);
    expect(result.current.readingsByUser.size).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the grouped map emitted by the subscription', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useAllReadings());

    const mine = makeReading({ id: 'doc-1' });
    const theirs = makeReading({ id: 'doc-2', bookId: 'book-2' });
    act(() =>
      handlers.onData(
        new Map([
          ['user-1', [mine]],
          ['user-2', [theirs]],
        ]),
      ),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.readingsByUser.size).toBe(2);
    expect(result.current.readingsByUser.get('user-1')).toEqual([mine]);
    expect(result.current.readingsByUser.get('user-2')).toEqual([theirs]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useAllReadings());

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.readingsByUser.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useAllReadings());

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData(new Map([['user-1', [makeReading()]]])));

    expect(result.current.error).toBeUndefined();
    expect(result.current.readingsByUser.size).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useAllReadings());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('subscribes once across rerenders', () => {
    captureHandlers();
    const { rerender } = renderHook(() => useAllReadings());
    rerender();
    rerender();
    expect(mockSubscribe).toHaveBeenCalledOnce();
  });
});
