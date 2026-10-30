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
  it('sends the cover url it was given', async () => {
    mockHttpsCallable.mockResolvedValue({
      data: {
        id: 'abc123',
        title: 'Dune',
        author: 'Frank Herbert',
        thumbnailUrl: 'https://example.com/dune.jpg',
      },
    });

    await createManualBook(
      'Dune',
      'Frank Herbert',
      'https://example.com/dune.jpg',
    );

    expect(mockHttpsCallable).toHaveBeenCalledWith({
      title: 'Dune',
      author: 'Frank Herbert',
      thumbnailUrl: 'https://example.com/dune.jpg',
    });
  });

  it('rejects a malformed callable response', async () => {
    mockHttpsCallable.mockResolvedValue({ data: { title: 'no id' } });

    await expect(createManualBook('Dune', 'Frank Herbert')).rejects.toThrow();
  });

  it('propagates a callable error', async () => {
    mockHttpsCallable.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'functions/invalid-argument' }),
    );

    await expect(createManualBook('', 'Frank Herbert')).rejects.toThrow('nope');
  });
});
