import {
  FieldValue,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { ReadingDocSchema } from '../schemas.js';
import type { BookFields } from '../books/join.js';

/** What the API returns: the stored reading plus its resolved book. */
export type ReadingDTO = Reading & BookFields;

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
