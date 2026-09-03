import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Reading } from '@bookbingo/lib-types';
import { useReadings } from './useReadings';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/readings', () => ({
  subscribeToReadings: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToReadings } from '../data/readings';

const mockSubscribe = vi.mocked(subscribeToReadings);

/** Callbacks handed to subscribeToReadings by the most recent call. */
type Handlers = {
  onData: (readings: Reading[]) => void;
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

describe('useReadings', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useReadings('user-1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.readings).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes readings emitted by the subscription', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useReadings('user-1'));

    const reading = makeReading({ id: 'doc-0', bookId: 'book-1' });
    act(() => handlers.onData([reading]));

    expect(result.current.loading).toBe(false);
    expect(result.current.readings).toEqual([reading]);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useReadings('user-1'));

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.readings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useReadings('user-1'));

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData([makeReading()]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.readings).toHaveLength(1);
  });

  it('does not subscribe and stays empty when userId is blank', () => {
    captureHandlers();
    const { result } = renderHook(() => useReadings(''));
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(result.current.readings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useReadings('user-1'));
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('resubscribes when userId changes', () => {
    const { unsubscribe } = captureHandlers();
    const { rerender } = renderHook(({ id }) => useReadings(id), {
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
