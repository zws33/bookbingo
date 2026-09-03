import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book, BookMetadata } from '@bookbingo/lib-types';
import { deriveBookId } from '@bookbingo/lib-core';

// Prevent real Firebase SDK initialization; the repository only passes `db`
// through to collection()/doc(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so onSnapshot returns whatever snapshot each test
// supplies instead of validating its args against a real Firestore instance.
// SERVER_TS stands in for the serverTimestamp() sentinel so writes can be
// asserted by value.
const SERVER_TS = { __sentinel: 'serverTimestamp' };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => SERVER_TS),
  onSnapshot: vi.fn(),
  QueryDocumentSnapshot: class {},
}));

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { getOrCreateBook, subscribeToBooks } from './books';

const mockOnSnapshot = vi.mocked(onSnapshot);
const mockGetDoc = vi.mocked(getDoc);
const mockSetDoc = vi.mocked(setDoc);

/** getDoc result stand-in: only exists() is read by getOrCreateBook. */
function snapshotExists(exists: boolean) {
  return { exists: () => exists } as never;
}

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

describe('getOrCreateBook', () => {
  const TITLE = 'The Left Hand of Darkness';
  const AUTHOR = 'Ursula K. Le Guin';

  it('reuses an existing document without writing', async () => {
    mockGetDoc.mockResolvedValue(snapshotExists(true));

    const bookId = await getOrCreateBook(TITLE, AUTHOR, 'user-1');

    expect(bookId).toBe(deriveBookId({ title: TITLE, author: AUTHOR }));
    expect(doc).toHaveBeenCalledWith({}, 'books', bookId);
    // Reusing as-is preserves the original createdBy/createdAt provenance.
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('creates the document with trimmed fields and merges', async () => {
    mockGetDoc.mockResolvedValue(snapshotExists(false));

    const bookId = await getOrCreateBook(
      '  Dune  ',
      ' Frank Herbert ',
      'user-1',
    );

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: `books/${bookId}` },
      {
        title: 'Dune',
        author: 'Frank Herbert',
        createdBy: 'user-1',
        createdAt: SERVER_TS,
      },
      { merge: true },
    );
  });

  it('writes externalIds and metadata when enrichment is supplied', async () => {
    mockGetDoc.mockResolvedValue(snapshotExists(false));
    const metadata: BookMetadata = {
      pageCount: 304,
      publishedDate: '1969',
      categories: ['Science Fiction'],
      language: 'eng',
      isbn: null,
      thumbnailUrl: null,
    };

    const bookId = await getOrCreateBook(TITLE, AUTHOR, 'user-1', {
      externalId: '/works/OL455403W',
      metadata,
    });

    // The Open Library key, not title/author, derives the id when present.
    expect(bookId).toBe(
      deriveBookId({
        openLibraryKey: '/works/OL455403W',
        title: TITLE,
        author: AUTHOR,
      }),
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: `books/${bookId}` },
      {
        title: TITLE,
        author: AUTHOR,
        externalIds: {
          openLibrary: { key: '/works/OL455403W', enrichedAt: SERVER_TS },
        },
        metadata,
        createdBy: 'user-1',
        createdAt: SERVER_TS,
      },
      { merge: true },
    );
  });
});
