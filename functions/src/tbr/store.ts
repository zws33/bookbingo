import {
  FieldValue,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';
import { isNotFound, mapValid } from '../common/firestoreHelpers.js';
import { requireBookExists } from '../books/store.js';
import {
  newReadingFields,
  readingDoc,
  requireNoOtherFreebie,
} from '../readings/store.js';
import { TBREntryDocSchema } from './schema.js';

export interface TBREntry {
  id: string;
  bookId: string;
  plannedTiles: string[];
  notes?: string;
  addedAt: Date;
  updatedAt?: Date;
}

export interface TBREntryFields {
  bookId: string;
  plannedTiles: string[];
  /** Explicit undefined is allowed: the parsed request omits it as undefined. */
  notes?: string | undefined;
}

export interface PromotionOutcome {
  readingId: string;
  bookId: string;
  /** The entry was already promoted by an earlier call whose response was lost. */
  alreadyLogged: boolean;
}

export interface TBREntryRepository {
  list(uid: string): Promise<TBREntry[]>;
  create(uid: string, fields: TBREntryFields): Promise<string>;
  update(
    uid: string,
    tbrId: string,
    fields: Omit<TBREntryFields, 'bookId'>,
  ): Promise<void>;
  remove(uid: string, tbrId: string): Promise<void>;
  promote(
    uid: string,
    tbrId: string,
    tiles: string[],
    isFreebie: boolean,
  ): Promise<PromotionOutcome>;
}

function tbrCollection(userId: string) {
  return db.collection('users').doc(userId).collection('tbr');
}

function tbrDoc(userId: string, tbrId: string) {
  return tbrCollection(userId).doc(tbrId);
}

function toTBREntry(doc: QueryDocumentSnapshot): TBREntry {
  const data = TBREntryDocSchema.parse(doc.data());
  return {
    id: doc.id,
    bookId: data.bookId,
    plannedTiles: data.plannedTiles,
    ...(data.notes !== undefined && { notes: data.notes }),
    addedAt: data.addedAt,
    ...(data.updatedAt !== undefined && { updatedAt: data.updatedAt }),
  };
}

const firestoreTBREntries: TBREntryRepository = {
  async list(uid) {
    const snapshot = await tbrCollection(uid).orderBy('addedAt', 'desc').get();
    return mapValid('tbr', snapshot.docs, toTBREntry);
  },

  async create(uid, { bookId, plannedTiles, notes }) {
    // Without this an entry can point at a book that does not exist, and
    // `listMyTBR` then fails for the whole list — which the UI cannot recover
    // from, because the list never renders the row that would let you delete it.
    const book = await db.collection('books').doc(bookId).get();
    if (!book.exists) {
      throw new DomainError('not-found', 'That book is not in the catalog.');
    }

    const ref = await tbrCollection(uid).add({
      bookId,
      plannedTiles,
      ...(notes ? { notes } : {}),
      addedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async update(uid, tbrId, { plannedTiles, notes }) {
    try {
      await tbrDoc(uid, tbrId).update({
        plannedTiles,
        // An empty note clears the field rather than storing '' — the shape the
        // read schema expects for "no note".
        notes: notes ? notes : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (isNotFound(error)) {
        throw new DomainError('not-found', 'That entry no longer exists.');
      }
      throw error;
    }
  },

  async remove(uid, tbrId) {
    await tbrDoc(uid, tbrId).delete();
  },

  /**
   * The reading takes the entry's id, which makes a retry safe: if the entry is
   * already gone but a reading exists at that id, the first call succeeded and
   * its response was lost, so this reports that reading instead of claiming the
   * entry "no longer exists" for a book the user did log.
   *
   * The book comes from the stored entry rather than the request — the entry
   * already names it, so there is nothing for a caller to disagree with.
   */
  async promote(uid, tbrId, tiles, isFreebie) {
    const readingRef = readingDoc(uid, tbrId);
    const entryRef = tbrDoc(uid, tbrId);
    let bookId = '';
    let alreadyLogged = false;

    await db.runTransaction(async (transaction) => {
      const entry = await transaction.get(entryRef);

      if (!entry.exists) {
        const existing = await transaction.get(readingRef);
        if (!existing.exists) {
          throw new DomainError('not-found', 'That entry no longer exists.');
        }
        alreadyLogged = true;
        return;
      }

      bookId = TBREntryDocSchema.parse(entry.data()).bookId;
      await requireBookExists(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, tbrId);

      transaction.set(readingRef, newReadingFields(bookId, tiles, isFreebie));
      transaction.delete(entryRef);
    });

    return { readingId: readingRef.id, bookId, alreadyLogged };
  },
};

export function tbrEntryRepository(): TBREntryRepository {
  return firestoreTBREntries;
}
