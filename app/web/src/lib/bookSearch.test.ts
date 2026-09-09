import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase', () => ({ functions: {} }));

const mockHttpsCallable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallable,
}));

import { searchBooks, resolveBookId } from './bookSearch';

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

describe('resolveBookId', () => {
  it('returns only the bookId from the callable response', async () => {
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

    const result = await resolveBookId('/works/OL1W');

    expect(result).toBe('abc123');
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

    await expect(resolveBookId('/works/OL1W')).rejects.toThrow();
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { title: 'Missing fields' } });

    await expect(resolveBookId('/works/OL1W')).rejects.toThrow();
  });
});
