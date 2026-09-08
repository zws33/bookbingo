import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase', () => ({ functions: {} }));

// vi.hoisted ensures mockHttpsCallable is initialized before the module-level
// httpsCallable(functions, 'createManualBook') call in createManualBook.ts runs.
const mockHttpsCallable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockHttpsCallable,
}));

import { createManualBook } from './createManualBook';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createManualBook', () => {
  it('returns the bookId from a valid response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { bookId: 'abc123' } });

    await expect(createManualBook('Dune', 'Frank Herbert')).resolves.toBe(
      'abc123',
    );
    expect(mockHttpsCallable).toHaveBeenCalledWith({
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
    });
  });

  it('passes through explicit metadata when provided', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { bookId: 'abc123' } });
    const metadata = {
      pageCount: 412,
      publishedDate: '1965',
      categories: ['Science Fiction'],
      language: 'en',
      isbn: '9780441172719',
      thumbnailUrl: null,
    };

    await createManualBook('Dune', 'Frank Herbert', metadata);

    expect(mockHttpsCallable).toHaveBeenCalledWith({
      title: 'Dune',
      author: 'Frank Herbert',
      metadata,
    });
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: {} });

    await expect(createManualBook('Dune', 'Frank Herbert')).rejects.toThrow();
  });

  it('propagates a callable error', async () => {
    mockHttpsCallable.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'functions/invalid-argument' }),
    );

    await expect(createManualBook('', 'Frank Herbert')).rejects.toThrow('nope');
  });
});
