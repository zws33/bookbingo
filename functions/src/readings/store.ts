import {
  FieldValue,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';
import { mapValid } from '../common/firestoreDoc.js';
import { ReadingDocSchema } from './schema.js';
import type { BookMetadata } from '@bookbingo/lib-types';

/** What the API returns: the stored reading plus its resolved book. */
export type ReadingDTO = Reading & {
  bookTitle: string;
  bookAuthor: string;
  bookMetadata: BookMetadata;
};

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

/**
 * Groups collection-group documents by the user id in each document's path.
 *
 * Invalid documents are dropped by `mapValid` rather than failing the whole
 * read: one malformed reading must not blank a leaderboard.
 */
export function readingsByUser(
  docs: QueryDocumentSnapshot[],
): Map<string, Reading[]> {
  const byUser = new Map<string, Reading[]>();

  for (const doc of docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    const [reading] = mapValid('readings', [doc], toReading);
    if (!reading) continue;

    const existing = byUser.get(userId);
    if (existing) existing.push(reading);
    else byUser.set(userId, [reading]);
  }

  return byUser;
}

/**
 * At most one freebie per user.
 *
 * Shared by the create, update and promote paths: three writers of the same
 * rule, so it lives in one place where a change reaches all of them.
 */
export async function requireNoOtherFreebie(
  transaction: Transaction,
  uid: string,
  readingId: string,
): Promise<void> {
  const freebies = await transaction.get(
    readingsCollection(uid).where('isFreebie', '==', true).limit(2),
  );
  const other = freebies.docs.find((doc) => doc.id !== readingId);
  if (other) {
    throw new DomainError('conflict', 'You already have a freebie reading.');
  }
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
