import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prevent real Firebase SDK initialization; getReadingsByUser only passes
// `db` through to collection(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so the query builders don't validate their args and
// getDocs returns whatever snapshot each test supplies.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  getDocs: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { getReadingsByUser } from './readings';

const mockGetDocs = vi.mocked(getDocs);

/** Minimal Firestore Timestamp stand-in: only toDate() is used by toReading. */
function ts(date: Date) {
  return { toDate: () => date };
}

/** Build a QuerySnapshot-like object from (id, data) pairs. */
function makeSnapshot(docs: { id: string; data: Record<string, unknown> }[]) {
  return {
    docs: docs.map(({ id, data }) => ({ id, data: () => data })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getReadingsByUser', () => {
  it('maps snapshot docs to Reading[], converting Timestamps to Dates', async () => {
    const readAt = new Date('2026-02-01T00:00:00Z');
    const createdAt = new Date('2026-01-15T00:00:00Z');
    const updatedAt = new Date('2026-02-02T00:00:00Z');
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'reading-1',
          data: {
            bookId: 'book-1',
            tiles: ['sci-fi', 'award-winner'],
            isFreebie: false,
            readAt: ts(readAt),
            createdAt: ts(createdAt),
            updatedAt: ts(updatedAt),
          },
        },
      ]) as never,
    );

    const readings = await getReadingsByUser('user-1');

    expect(readings).toEqual([
      {
        id: 'reading-1',
        bookId: 'book-1',
        tiles: ['sci-fi', 'award-winner'],
        isFreebie: false,
        readAt,
        createdAt,
        updatedAt,
      },
    ]);
  });

  it('leaves updatedAt undefined when the field is absent', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'reading-1',
          data: {
            bookId: 'book-1',
            tiles: [],
            isFreebie: true,
            readAt: ts(new Date('2026-02-01T00:00:00Z')),
            createdAt: ts(new Date('2026-01-15T00:00:00Z')),
            // no updatedAt
          },
        },
      ]) as never,
    );

    const [reading] = await getReadingsByUser('user-1');

    expect(reading!.updatedAt).toBeUndefined();
  });

  it('queries the user\'s readings ordered by readAt descending', async () => {
    mockGetDocs.mockResolvedValue(makeSnapshot([]) as never);

    await getReadingsByUser('user-42');

    expect(collection).toHaveBeenCalledWith({}, 'users', 'user-42', 'readings');
    expect(orderBy).toHaveBeenCalledWith('readAt', 'desc');
    expect(query).toHaveBeenCalledWith(
      { path: 'users/user-42/readings' },
      { field: 'readAt', direction: 'desc' },
    );
    expect(mockGetDocs).toHaveBeenCalledOnce();
  });

  it('returns an empty array for an empty snapshot', async () => {
    mockGetDocs.mockResolvedValue(makeSnapshot([]) as never);

    await expect(getReadingsByUser('user-1')).resolves.toEqual([]);
  });
});
