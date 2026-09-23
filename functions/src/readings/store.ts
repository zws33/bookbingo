import {
  FieldValue,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';
import { mapValid } from '../common/firestoreDoc.js';
import { requireBookExists } from '../books/store.js';
import { ReadingDocSchema } from './schema.js';

/** A reading as stored: a tile assignment pointing at a book by id. */
export interface Reading {
  id: string;
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ReadingFields {
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
}

export interface ReadingRepository {
  list(userId: string): Promise<Reading[]>;
  listAllByUser(): Promise<Map<string, Reading[]>>;
  create(uid: string, fields: ReadingFields): Promise<string>;
  update(uid: string, readingId: string, fields: ReadingFields): Promise<void>;
  remove(uid: string, readingId: string): Promise<void>;
}

function readingsCollection(userId: string) {
  return db.collection('users').doc(userId).collection('readings');
}

/** Exported for the TBR promote path, which writes a reading in its own transaction. */
export function readingDoc(userId: string, readingId: string) {
  return readingsCollection(userId).doc(readingId);
}

export function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = ReadingDocSchema.parse(doc.data());
  return {
    id: doc.id, // ID is the key, not a stored field
    bookId: data.bookId,
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    readAt: data.readAt,
    createdAt: data.createdAt,
    ...(data.updatedAt !== undefined && { updatedAt: data.updatedAt }),
  };
}

/**
 * Groups collection-group documents by the user id in each document's path.
 *
 * Invalid documents are dropped by `mapValid` rather than failing the whole
 * read: one malformed reading must not blank a leaderboard.
 */
function readingsByUser(docs: QueryDocumentSnapshot[]): Map<string, Reading[]> {
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

const firestoreReadings: ReadingRepository = {
  async list(userId) {
    const snapshot = await readingsCollection(userId)
      .orderBy('readAt', 'desc')
      .get();
    return mapValid('readings', snapshot.docs, toReading);
  },

  async listAllByUser() {
    const snapshot = await db.collectionGroup('readings').get();
    return readingsByUser(snapshot.docs);
  },

  async create(uid, { bookId, tiles, isFreebie }) {
    const ref = readingsCollection(uid).doc();

    await db.runTransaction(async (transaction) => {
      await requireBookExists(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, ref.id);
      transaction.set(ref, newReadingFields(bookId, tiles, isFreebie));
    });

    return ref.id;
  },

  async update(uid, readingId, { bookId, tiles, isFreebie }) {
    const ref = readingDoc(uid, readingId);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      // The path is built from the caller's own uid, so another user's reading
      // id simply does not resolve — there is nothing to leak here.
      if (!existing.exists) {
        throw new DomainError('not-found', 'That reading no longer exists.');
      }
      await requireBookExists(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, readingId);

      transaction.update(ref, {
        bookId,
        tiles,
        isFreebie,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  },

  async remove(uid, readingId) {
    await readingDoc(uid, readingId).delete();
  },
};

/** The module singleton, not a new instance per call. */
export function readingRepository(): ReadingRepository {
  return firestoreReadings;
}
