import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '@bookbingo/lib-types';
import { EMPTY_METADATA } from '@bookbingo/lib-types';

// Prevent real Firebase SDK initialization; the repository only passes `db`
// through to collection(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so getDocs returns whatever snapshot each test
// supplies instead of validating its args against a real Firestore instance.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  documentId: vi.fn(() => '__name__'),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
  QueryDocumentSnapshot: class {},
}));

import { getDocs } from 'firebase/firestore';
import { getBooksById } from './books';

const mockGetDocs = vi.mocked(getDocs);

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

describe('getBooksById', () => {
  it('returns an empty array without querying when given no ids', async () => {
    const result = await getBooksById([]);

    expect(result).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('dedupes ids and maps the returned docs to Book[]', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockGetDocs.mockResolvedValue(
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
      ]) as never,
    );

    const result = await getBooksById(['book-1', 'book-1']);

    expect(mockGetDocs).toHaveBeenCalledOnce();
    expect(result).toEqual<Book[]>([
      {
        id: 'book-1',
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        metadata: EMPTY_METADATA,
      },
    ]);
  });

  it('batches ids into multiple queries above the 30-id `in` clause cap', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `book-${i}`);
    mockGetDocs.mockResolvedValue(makeSnapshot([]) as never);

    await getBooksById(ids);

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  // The required-metadata invariant: legacy documents predate it, so the read
  // path backfills rather than dropping them.
  it('backfills empty metadata for a document with no metadata field', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'book-1',
          data: {
            title: 'The Left Hand of Darkness',
            author: 'Ursula K. Le Guin',
          },
        },
      ]) as never,
    );

    const [book] = await getBooksById(['book-1']);
    expect(book!.metadata).toEqual(EMPTY_METADATA);
  });

  it('backfills empty metadata for a document storing metadata as null', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'book-1',
          data: { title: 'Dune', author: 'Frank Herbert', metadata: null },
        },
      ]) as never,
    );

    const [book] = await getBooksById(['book-1']);
    expect(book!.metadata).toEqual(EMPTY_METADATA);
  });

  // Per-field recovery is the point: one bad field must not cost the others.
  it('keeps the surviving metadata fields when individual fields are invalid', async () => {
    mockGetDocs.mockResolvedValue(
      makeSnapshot([
        {
          id: 'book-1',
          data: {
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
          },
        },
      ]) as never,
    );

    const books = await getBooksById(['book-1']);
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

  it('skips a document missing a required field and delivers the rest', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockGetDocs.mockResolvedValue(
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
      ]) as never,
    );

    const books = await getBooksById(['invalid-book', 'book-1']);
    expect(books).toHaveLength(1);
    expect(books[0]!.id).toBe('book-1');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('delivers a document with an unknown externalIds provider key', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockGetDocs.mockResolvedValue(
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
      ]) as never,
    );

    // `externalIds` is write-only provenance that no reader consumes, so
    // BookDocSchema does not validate it and an unrecognized provider key
    // cannot cost the user a book.
    const books = await getBooksById(['book-1']);
    expect(books).toHaveLength(1);
    expect(books[0]!.id).toBe('book-1');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
