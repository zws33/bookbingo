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
  onSnapshot: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { getReadingsByUser, subscribeToReadings } from './readings';

const mockGetDocs = vi.mocked(getDocs);
const mockOnSnapshot = vi.mocked(onSnapshot);

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

  it("queries the user's readings ordered by readAt descending", async () => {
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

  it('falls back to a Date when serverTimestamp fields are still pending (null)', async () => {
    // Local snapshot before the write lands: readAt/createdAt are null.
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'reading-1',
          data: {
            bookId: 'book-1',
            tiles: [],
            isFreebie: false,
            readAt: null,
            createdAt: null,
          },
        },
      ]) as never,
    );

    const [reading] = await getReadingsByUser('user-1');

    expect(reading!.readAt).toBeInstanceOf(Date);
    expect(reading!.createdAt).toBeInstanceOf(Date);
  });
});

describe('subscribeToReadings', () => {
  it('queries the ordered readings subcollection and returns the unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToReadings('user-42', vi.fn(), vi.fn());

    expect(collection).toHaveBeenCalledWith({}, 'users', 'user-42', 'readings');
    expect(orderBy).toHaveBeenCalledWith('readAt', 'desc');
    expect(mockOnSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(unsubscribe);
  });

  it('maps each pushed snapshot to Reading[] via onData', () => {
    const readAt = new Date('2026-02-01T00:00:00Z');
    const createdAt = new Date('2026-01-15T00:00:00Z');
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn();
    subscribeToReadings('user-1', onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'reading-1',
          data: {
            bookId: 'book-1',
            tiles: ['sci-fi'],
            isFreebie: false,
            readAt: ts(readAt),
            createdAt: ts(createdAt),
          },
        },
      ]),
    );

    expect(onData).toHaveBeenCalledWith([
      {
        id: 'reading-1',
        bookId: 'book-1',
        tiles: ['sci-fi'],
        isFreebie: false,
        readAt,
        createdAt,
        updatedAt: undefined,
      },
    ]);
  });

  it('forwards listener errors to onError', () => {
    let raise: (e: Error) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      _onNext: unknown,
      onError: (e: Error) => void,
    ) => {
      raise = onError;
      return vi.fn();
    }) as never);

    const onError = vi.fn();
    subscribeToReadings('user-1', vi.fn(), onError);

    const err = new Error('permission-denied');
    raise(err);

    expect(onError).toHaveBeenCalledWith(err);
  });
});
