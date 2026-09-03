import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ db: {} }));

// SERVER_TS and DELETE_FIELD stand in for the Firestore sentinels so writes can
// be asserted by value.
const SERVER_TS = { __sentinel: 'serverTimestamp' };
const DELETE_FIELD = { __sentinel: 'deleteField' };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  // doc(db, ...segments) addresses an existing document; doc(collectionRef)
  // with no segments is the "let Firestore generate the id" form that
  // promoteTBREntry uses to build a reading ref before committing.
  doc: vi.fn((ref: { path?: string }, ...path: string[]) =>
    path.length === 0 && typeof ref?.path === 'string'
      ? { path: `${ref.path}/generated-id`, id: 'generated-id' }
      : { path: path.join('/') },
  ),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => SERVER_TS),
  deleteField: vi.fn(() => DELETE_FIELD),
  onSnapshot: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import {
  addDoc,
  collection,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  createTBREntry,
  deleteTBREntry,
  promoteTBREntry,
  subscribeToTBR,
  updateTBREntry,
} from './tbr';

const mockOnSnapshot = vi.mocked(onSnapshot);
const mockAddDoc = vi.mocked(addDoc);
const mockUpdateDoc = vi.mocked(updateDoc);
const mockDeleteDoc = vi.mocked(deleteDoc);
const mockWriteBatch = vi.mocked(writeBatch);

/** WriteBatch stand-in: records set/delete calls and resolves on commit. */
function stubBatch() {
  const batch = {
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  mockWriteBatch.mockReturnValue(batch as never);
  return batch;
}

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

describe('subscribeToTBR', () => {
  it('queries the user tbr subcollection ordered by addedAt descending', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToTBR('user-42', vi.fn(), vi.fn());

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
    subscribeToTBR('user-1', onData, vi.fn());

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
    subscribeToTBR('user-1', onData, vi.fn());

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
    subscribeToTBR('user-1', vi.fn(), onError);

    const error = new Error('permission-denied');
    raise(error);

    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('TBR writes', () => {
  it('createTBREntry adds to the user tbr subcollection and returns the id', async () => {
    mockAddDoc.mockResolvedValue({ id: 'tbr-1' } as never);

    const id = await createTBREntry('user-1', 'book-1', ['sci-fi']);

    expect(id).toBe('tbr-1');
    expect(mockAddDoc).toHaveBeenCalledWith(
      { path: 'users/user-1/tbr' },
      {
        bookId: 'book-1',
        plannedTiles: ['sci-fi'],
        addedAt: SERVER_TS,
      },
    );
  });

  it('createTBREntry trims notes and omits the field when blank', async () => {
    mockAddDoc.mockResolvedValue({ id: 'tbr-1' } as never);

    await createTBREntry('user-1', 'book-1', [], '  a note  ');
    expect(mockAddDoc.mock.calls[0]![1]).toMatchObject({ notes: 'a note' });

    await createTBREntry('user-1', 'book-1', [], '   ');
    expect(mockAddDoc.mock.calls[1]![1]).not.toHaveProperty('notes');
  });

  it('updateTBREntry clears notes with deleteField when blank', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    await updateTBREntry('user-1', 'tbr-1', ['mystery'], '');

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'users/user-1/tbr/tbr-1' },
      {
        plannedTiles: ['mystery'],
        notes: DELETE_FIELD,
        updatedAt: SERVER_TS,
      },
    );
  });

  it('deleteTBREntry targets the entry document', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteTBREntry('user-1', 'tbr-1');

    expect(mockDeleteDoc).toHaveBeenCalledWith({
      path: 'users/user-1/tbr/tbr-1',
    });
  });

  it('promoteTBREntry batches the reading create with the TBR delete', async () => {
    const batch = stubBatch();

    const readingId = await promoteTBREntry(
      'user-1',
      'tbr-1',
      'book-1',
      ['sci-fi'],
      true,
    );

    expect(readingId).toBe('generated-id');
    // The reading lands in the readings collection, not under tbr.
    expect(collection).toHaveBeenCalledWith({}, 'users', 'user-1', 'readings');
    expect(batch.set).toHaveBeenCalledWith(
      { path: 'users/user-1/readings/generated-id', id: 'generated-id' },
      {
        bookId: 'book-1',
        tiles: ['sci-fi'],
        isFreebie: true,
        readAt: SERVER_TS,
        createdAt: SERVER_TS,
      },
    );
    expect(batch.delete).toHaveBeenCalledWith({
      path: 'users/user-1/tbr/tbr-1',
    });
    // One commit — the two writes must land together or not at all.
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  it('promoteTBREntry rethrows a failed commit after logging it', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const batch = stubBatch();
    const failure = new Error('permission-denied');
    batch.commit.mockRejectedValue(failure);

    await expect(
      promoteTBREntry('user-1', 'tbr-1', 'book-1', [], false),
    ).rejects.toThrow(failure);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
