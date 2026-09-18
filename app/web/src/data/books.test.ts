import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '@bookbingo/lib-types';
import { EMPTY_METADATA } from '@bookbingo/lib-types';

// The callable is bound at module load, so stub the factory rather than the
// Firebase SDK: these tests are about the wrapper's contract, not transport.
// vi.hoisted is required — data/books.ts calls createCallable while importing,
// which is before a plain const in this file would be initialized.
const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock('../lib/callable', () => ({
  createCallable: () => callMock,
}));

import { getBooksById } from './books';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getBooksById', () => {
  it('returns an empty array without calling the function when given no ids', async () => {
    const result = await getBooksById([]);

    expect(result).toEqual([]);
    expect(callMock).not.toHaveBeenCalled();
  });

  it('dedupes ids before calling', async () => {
    callMock.mockResolvedValue([]);

    await getBooksById(['book-1', 'book-1', 'book-2']);

    expect(callMock).toHaveBeenCalledOnce();
    expect(callMock).toHaveBeenCalledWith({ ids: ['book-1', 'book-2'] });
  });

  it('returns the books the function resolved', async () => {
    const book: Book = {
      id: 'book-1',
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      metadata: EMPTY_METADATA,
    };
    callMock.mockResolvedValue([book]);

    expect(await getBooksById(['book-1'])).toEqual<Book[]>([book]);
  });

  it('propagates a failed call so the caller can surface it', async () => {
    callMock.mockRejectedValue(new Error('functions/unavailable'));

    await expect(getBooksById(['book-1'])).rejects.toThrow(
      'functions/unavailable',
    );
  });
});
