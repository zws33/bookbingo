import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '@bookbingo/lib-types';
import { EMPTY_METADATA } from '@bookbingo/lib-types';

// Prevent real Firebase SDK initialization; the repository only passes `db`
// through to collection(), which we mock below.
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
    docs: docs.map(({ id, data }) => ({
      id,
      data: () => data,
      ref: { path: `books/${id}` },
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Pushes one document through the listener and returns the onData spy. */
function pushOneBook(data: Record<string, unknown>) {
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
  pushSnapshot(makeSnapshot([{ id: 'book-1', data }]));
  return onData;
}

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
            externalIds: { openLibrary: '/works/OL455403W' },
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
        metadata: EMPTY_METADATA,
      },
    ]);
  });

  // The required-metadata invariant: legacy documents predate it, so the read
  // path backfills rather than dropping them.
  it('backfills empty metadata for a document with no metadata field', () => {
    const onData = pushOneBook({
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
    });

    const [books] = onData.mock.calls[0]!;
    expect(books[0]!.metadata).toEqual(EMPTY_METADATA);
  });

  it('backfills empty metadata for a document storing metadata as null', () => {
    const onData = pushOneBook({
      title: 'Dune',
      author: 'Frank Herbert',
      metadata: null,
    });

    const [books] = onData.mock.calls[0]!;
    expect(books[0]!.metadata).toEqual(EMPTY_METADATA);
  });

  // Per-field recovery is the point: one bad field must not cost the others.
  it('keeps the surviving metadata fields when individual fields are invalid', () => {
    const onData = pushOneBook({
      title: 'Dune',
      author: 'Frank Herbert',
      metadata: {
        pageCount: 412,
        publishedDate: '1965',
        categories: ['Science Fiction'],
        language: 'en',
        isbn: -1,
        thumbnailUrl: '',
      },
    });

    const [books] = onData.mock.calls[0]!;
    expect(books).toHaveLength(1);
    expect(books[0]!.metadata).toEqual({
      pageCount: 412,
      publishedDate: '1965',
      categories: ['Science Fiction'],
      language: 'en',
      isbn: null,
      thumbnailUrl: null,
    });
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

  it('skips a document missing a required field and delivers the rest', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
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
          id: 'invalid-book',
          data: {
            // title is missing
            author: 'Unknown',
            createdBy: 'user-1',
            createdAt: ts(new Date('2026-01-01T00:00:00Z')),
          },
        },
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
    expect(books).toHaveLength(1);
    expect(books[0]!.id).toBe('book-1');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('delivers a document with an unknown externalIds provider key', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
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
            externalIds: { unknownProvider: 'abc' },
            createdBy: 'user-1',
            createdAt: ts(new Date('2026-01-01T00:00:00Z')),
          },
        },
      ]),
    );

    // `externalIds` is write-only provenance that no reader consumes, so
    // BookDocSchema does not validate it and an unrecognized provider key
    // cannot cost the user a book.
    const [books] = onData.mock.calls[0]!;
    expect(books).toHaveLength(1);
    expect(books[0]!.id).toBe('book-1');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
