import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase', () => ({ functions: {} }));

const mockHttpsCallable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallable,
}));

import { searchBooks, resolveBook } from './bookSearch';

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

describe('resolveBook', () => {
  it('returns the whole book the callable resolved', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: {
        id: 'abc123',
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

    const book = await resolveBook('/works/OL1W');

    expect(book.id).toBe('abc123');
    expect(book.title).toBe('Dune');
    expect(book.metadata.pageCount).toBe(412);
  });

  it('rejects a response with no book id', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: { title: 'Dune', author: 'Frank Herbert' },
    });

    await expect(resolveBook('/works/OL1W')).rejects.toThrow();
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { title: 'Missing fields' } });

    await expect(resolveBook('/works/OL1W')).rejects.toThrow();
  });
});
