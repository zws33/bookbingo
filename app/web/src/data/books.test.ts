import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '@bookbingo/lib-types';

// Prevent real Firebase SDK initialization; subscribeToBooks only passes
// `db` through to collection(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so onSnapshot returns whatever snapshot each test
// supplies instead of validating its args against a real Firestore instance.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  onSnapshot: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import { collection, onSnapshot } from 'firebase/firestore';
import { subscribeToBooks } from './books';

const mockOnSnapshot = vi.mocked(onSnapshot);

/** Minimal Firestore Timestamp stand-in: only toDate() is used by toBook. */
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

describe('subscribeToBooks', () => {
  it('queries the shared books collection and returns the unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToBooks(vi.fn(), vi.fn());

    expect(collection).toHaveBeenCalledWith({}, 'books');
    expect(mockOnSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(unsubscribe);
  });

  it('maps each pushed snapshot to Book[] via onData', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const enrichedAt = new Date('2026-01-02T00:00:00Z');
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn();
    subscribeToBooks(onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'book-1',
          data: {
            title: 'The Left Hand of Darkness',
            author: 'Ursula K. Le Guin',
            externalIds: {
              openLibrary: {
                key: '/works/OL455403W',
                enrichedAt: ts(enrichedAt),
              },
            },
            createdBy: 'user-1',
            createdAt: ts(createdAt),
          },
        },
      ]),
    );

    expect(onData).toHaveBeenCalledWith([
      {
        id: 'book-1',
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        metadata: undefined,
        externalIds: {
          openLibrary: {
            key: '/works/OL455403W',
            enrichedAt,
          },
        },
        createdBy: 'user-1',
        createdAt,
      },
    ]);
  });

  it('falls back to a Date when createdAt is still a pending serverTimestamp (null)', () => {
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn<(books: Book[]) => void>();
    subscribeToBooks(onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'book-1',
          data: {
            title: 'Untitled',
            author: 'Unknown',
            createdBy: 'user-1',
            createdAt: null,
          },
        },
      ]),
    );

    const [books] = onData.mock.calls[0]!;
    expect(books[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('leaves externalIds undefined when the field is absent', () => {
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn<(books: Book[]) => void>();
    subscribeToBooks(onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'book-1',
          data: {
            title: 'Untitled',
            author: 'Unknown',
            createdBy: 'user-1',
            createdAt: ts(new Date('2026-01-01T00:00:00Z')),
          },
        },
      ]),
    );

    const [books] = onData.mock.calls[0]!;
    expect(books[0]!.externalIds).toBeUndefined();
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
    subscribeToBooks(vi.fn(), onError);

    const err = new Error('permission-denied');
    raise(err);

    expect(onError).toHaveBeenCalledWith(err);
  });
});
