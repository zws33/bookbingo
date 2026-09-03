import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Book } from '@bookbingo/lib-types';
import { useBooks } from './useBooks';

// The hook depends only on the repository seam; Firebase never enters the test.
vi.mock('../data/books', () => ({
  subscribeToBooks: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { subscribeToBooks } from '../data/books';

const mockSubscribe = vi.mocked(subscribeToBooks);

/** Callbacks handed to subscribeToBooks by the most recent call. */
type Handlers = {
  onData: (books: Book[]) => void;
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

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-0',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  mockSubscribe.mockReset();
});

describe('useBooks', () => {
  it('starts in loading state before the first snapshot', () => {
    captureHandlers();
    const { result } = renderHook(() => useBooks());
    expect(result.current.loading).toBe(true);
    expect(result.current.booksById.size).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes books emitted by the subscription as a Map keyed by id', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useBooks());

    const book = makeBook({ id: 'book-1', title: 'Left Hand of Darkness' });
    act(() => handlers.onData([book]));

    expect(result.current.loading).toBe(false);
    expect(result.current.booksById.size).toBe(1);
    expect(result.current.booksById.get('book-1')).toEqual(book);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces subscription errors and stops loading', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useBooks());

    const err = Object.assign(new Error('Permission denied'), {
      code: 'permission-denied' as const,
    });
    act(() => handlers.onError(err));

    expect(result.current.error).toBe(err);
    expect(result.current.booksById.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('clears a prior error once a later snapshot arrives', () => {
    const { handlers } = captureHandlers();
    const { result } = renderHook(() => useBooks());

    act(() => handlers.onError(new Error('transient')));
    act(() => handlers.onData([makeBook()]));

    expect(result.current.error).toBeUndefined();
    expect(result.current.booksById.size).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe } = captureHandlers();
    const { unmount } = renderHook(() => useBooks());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
