import {
  FieldValue,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type { BookMetadata } from '@bookbingo/lib-types';
import { db } from '../firebase.js';
import { BookDocSchema, ReadingDocSchema } from '../schemas.js';

/**
 * A reading as stored: a tile assignment pointing at a book by id.
 *
 * Instants are ISO strings, not Dates. The callable protocol encodes responses
 * as JSON, which has no date type, and a Date would arrive as `{}`. The client
 * parses these back into Dates at its own boundary.
 */
export interface Reading {
  id: string;
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: string;
  createdAt: string;
  updatedAt?: string;
}

/** The book fields the UI renders, joined onto a reading by `withBooks`. */
export interface ReadingBook {
  bookTitle: string;
  bookAuthor: string;
  bookMetadata: BookMetadata;
}

/** What the API returns: the stored reading plus its resolved book. */
export type ReadingDTO = Reading & ReadingBook;

/**
 * A reading pointing at a book document that does not exist.
 *
 * `createReading` and `promoteTBREntry` both reject a bookId with no document,
 * and books are never deleted, so this means the data is corrupt. Callers turn
 * it into an `internal` error rather than papering over it with a placeholder
 * title, which would hide the corruption behind something that looks like a
 * normal row.
 */
export class MissingBookError extends Error {
  readonly bookIds: string[];

  constructor(bookIds: string[]) {
    super(`No book document for: ${bookIds.join(', ')}`);
    this.name = 'MissingBookError';
    this.bookIds = bookIds;
  }
}

/** The one place the readings collection path is written. */
export function readingsCollection(userId: string) {
  return db.collection('users').doc(userId).collection('readings');
}

export function readingDoc(userId: string, readingId: string) {
  return readingsCollection(userId).doc(readingId);
}

/** Matches on any user's readings subcollection; feeds the leaderboard and library. */
export function allReadingsQuery() {
  return db.collectionGroup('readings');
}

export function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = ReadingDocSchema.parse(doc.data());
  return {
    id: doc.id, // ID is the key, not a stored field
    bookId: data.bookId,
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    readAt: data.readAt.toISOString(),
    createdAt: data.createdAt.toISOString(),
    ...(data.updatedAt !== undefined && {
      updatedAt: data.updatedAt.toISOString(),
    }),
  };
}

/**
 * Resolves each reading's book in one `getAll` over the distinct ids.
 *
 * Throws `MissingBookError` naming every unresolved id, rather than resolving
 * what it can: a reading whose book is gone is a data error, and reporting all
 * of them at once makes it one fix instead of a game of whack-a-mole.
 */
export async function withBooks(readings: Reading[]): Promise<ReadingDTO[]> {
  if (readings.length === 0) return [];

  const bookIds = [...new Set(readings.map((reading) => reading.bookId))];
  const snapshots = await db.getAll(
    ...bookIds.map((id) => db.collection('books').doc(id)),
  );

  const booksById = new Map<string, ReadingBook>();
  const missing: string[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      missing.push(snapshot.id);
      continue;
    }
    const book = BookDocSchema.parse(snapshot.data());
    booksById.set(snapshot.id, {
      bookTitle: book.title,
      bookAuthor: book.author,
      bookMetadata: book.metadata,
    });
  }

  if (missing.length > 0) throw new MissingBookError(missing);

  return readings.map((reading) => {
    const book = booksById.get(reading.bookId);
    if (!book) throw new MissingBookError([reading.bookId]);
    return { ...reading, ...book };
  });
}

/** Field set for a newly created reading. Shared with the TBR promote path. */
export function newReadingFields(
  bookId: string,
  tiles: string[],
  isFreebie: boolean,
) {
  return {
    bookId,
    tiles,
    isFreebie,
    readAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
}
