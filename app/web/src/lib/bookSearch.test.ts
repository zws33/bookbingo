import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase', () => ({ functions: {} }));

// vi.hoisted ensures mockHttpsCallable is initialized before the module-level
// httpsCallable(functions, 'enrichBook') call in bookSearch.ts runs.
const mockHttpsCallable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallable,
}));

import { searchBooks, lookupBook } from './bookSearch';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchBooks', () => {
  it('parses a valid response into BookSearchResult[]', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: [
        {
          externalId: '/works/OL1W',
          title: 'Dune',
          author: 'Frank Herbert',
          thumbnailUrl: null,
          publishedDate: '1965',
        },
      ],
    });

    await expect(searchBooks('dune')).resolves.toEqual([
      {
        externalId: '/works/OL1W',
        title: 'Dune',
        author: 'Frank Herbert',
        thumbnailUrl: null,
        publishedDate: '1965',
      },
    ]);
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: [{ title: 'Missing id' }] });

    await expect(searchBooks('dune')).rejects.toThrow();
  });
});

describe('lookupBook', () => {
  it('parses a valid response into BookLookupResult, including bookId', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: {
        bookId: 'abc123',
        externalId: '/works/OL1W',
        title: 'Dune',
        author: 'Frank Herbert',
        metadata: {
          pageCount: 412,
          publishedDate: '1965',
          categories: [],
          language: 'en',
          isbn: null,
          thumbnailUrl: null,
        },
      },
    });

    const result = await lookupBook('/works/OL1W');

    expect(result.bookId).toBe('abc123');
    expect(result.title).toBe('Dune');
  });

  it('rejects a callable response missing bookId', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: {
        externalId: '/works/OL1W',
        title: 'Dune',
        author: 'Frank Herbert',
        metadata: {
          pageCount: null,
          publishedDate: null,
          categories: [],
          language: null,
          isbn: null,
          thumbnailUrl: null,
        },
      },
    });

    await expect(lookupBook('/works/OL1W')).rejects.toThrow();
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { title: 'Missing fields' } });

    await expect(lookupBook('/works/OL1W')).rejects.toThrow();
  });
});
