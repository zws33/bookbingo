import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  onSnapshot: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { subscribeToTbrEntries } from './tbr';

const mockOnSnapshot = vi.mocked(onSnapshot);

function ts(date: Date) {
  return { toDate: () => date };
}

function makeSnapshot(docs: { id: string; data: Record<string, unknown> }[]) {
  return {
    docs: docs.map(({ id, data }) => ({ id, data: () => data })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscribeToTbrEntries', () => {
  it('queries the user tbr subcollection ordered by addedAt descending', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToTbrEntries('user-42', vi.fn(), vi.fn());

    expect(collection).toHaveBeenCalledWith({}, 'users', 'user-42', 'tbr');
    expect(orderBy).toHaveBeenCalledWith('addedAt', 'desc');
    expect(query).toHaveBeenCalledWith(
      { path: 'users/user-42/tbr' },
      { field: 'addedAt', direction: 'desc' },
    );
    expect(result).toBe(unsubscribe);
  });

  it('maps each pushed snapshot to TBREntry[] via onData', () => {
    const addedAt = new Date('2026-02-01T00:00:00Z');
    const updatedAt = new Date('2026-02-02T00:00:00Z');
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn();
    subscribeToTbrEntries('user-1', onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'tbr-1',
          data: {
            bookId: 'book-1',
            plannedTiles: ['sci-fi'],
            notes: 'Borrowed from library',
            addedAt: ts(addedAt),
            updatedAt: ts(updatedAt),
          },
        },
      ]),
    );

    expect(onData).toHaveBeenCalledWith([
      {
        id: 'tbr-1',
        bookId: 'book-1',
        plannedTiles: ['sci-fi'],
        notes: 'Borrowed from library',
        addedAt,
        updatedAt,
      },
    ]);
  });

  it('falls back to a Date when addedAt is still pending (null)', () => {
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn();
    subscribeToTbrEntries('user-1', onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'tbr-1',
          data: {
            bookId: 'book-1',
            plannedTiles: [],
            addedAt: null,
          },
        },
      ]),
    );

    const [entries] = onData.mock.calls[0]!;
    expect(entries[0]!.addedAt).toBeInstanceOf(Date);
  });

  it('forwards listener errors to onError', () => {
    let raise: (error: Error) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      _onNext: unknown,
      onError: (error: Error) => void,
    ) => {
      raise = onError;
      return vi.fn();
    }) as never);

    const onError = vi.fn();
    subscribeToTbrEntries('user-1', vi.fn(), onError);

    const error = new Error('permission-denied');
    raise(error);

    expect(onError).toHaveBeenCalledWith(error);
  });
});
