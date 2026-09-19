import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import {
  FieldValue,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import z from 'zod/v4';
import { db } from '../firebase.js';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure } from '../observability.js';
import { TBREntryDocSchema, mapValid } from '../schemas.js';
import { newReadingFields, readingsCollection } from '../readings/store.js';
import { validateTiles } from '../readings/validate.js';
import { MissingBookError, withBooks, type BookFields } from '../books/join.js';

/** What the API returns: the stored entry plus its resolved book. */
export type TBREntryDTO = TBREntry & BookFields;

/** Instants are ISO strings for the same reason as Reading. */
export interface TBREntry {
  id: string;
  bookId: string;
  plannedTiles: string[];
  notes?: string;
  addedAt: string;
  updatedAt?: string;
}

const NotesSchema = z.string().trim().max(2000).optional();

const CreateTBRRequestSchema = z.object({
  bookId: z.string().trim().min(1),
  plannedTiles: z.array(z.string().trim().min(1)),
  notes: NotesSchema,
});

const UpdateTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
  plannedTiles: z.array(z.string().trim().min(1)),
  notes: NotesSchema,
});

const DeleteTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
});

const PromoteTBRRequestSchema = z.object({
  tbrId: z.string().trim().min(1),
  bookId: z.string().trim().min(1),
  tiles: z.array(z.string().trim().min(1)),
  isFreebie: z.boolean(),
});

/** The one place the TBR collection path is written. */
function tbrCollection(userId: string) {
  return db.collection('users').doc(userId).collection('tbr');
}

function tbrDoc(userId: string, tbrId: string) {
  return tbrCollection(userId).doc(tbrId);
}

function toTBREntry(doc: QueryDocumentSnapshot): TBREntry {
  const data = TBREntryDocSchema.parse(doc.data());
  return {
    id: doc.id, // ID is the key, not a stored field
    bookId: data.bookId,
    plannedTiles: data.plannedTiles,
    ...(data.notes !== undefined && { notes: data.notes }),
    addedAt: data.addedAt.toISOString(),
    ...(data.updatedAt !== undefined && {
      updatedAt: data.updatedAt.toISOString(),
    }),
  };
}

/**
 * The caller's own TBR list, newest first.
 *
 * Unlike readings, a TBR list is private — there is no userId parameter, so
 * there is no way to ask for someone else's.
 */
export async function listMyTBRHandler(
  request: CallableRequest<unknown>,
): Promise<TBREntryDTO[]> {
  const { uid } = requireAuth(request, 'load your reading list');

  const snapshot = await tbrCollection(uid).orderBy('addedAt', 'desc').get();
  const entries = mapValid('tbr', snapshot.docs, toTBREntry);

  try {
    return await withBooks(entries);
  } catch (error) {
    if (error instanceof MissingBookError) {
      logFailure('tbr.list', error, {
        uid,
        outcome: 'error',
        stage: 'join',
        bookIds: error.bookIds,
      });
      throw new HttpsError('internal', 'Could not load your reading list.');
    }
    throw error;
  }
}

export async function createTBREntryHandler(
  request: CallableRequest<unknown>,
): Promise<{ tbrId: string }> {
  const { uid } = requireAuth(request, 'add to your reading list');
  const { bookId, plannedTiles, notes } = parseRequest(
    CreateTBRRequestSchema,
    request.data,
  );
  // A plan is not a reading, so the cap does not apply — but the tiles still
  // have to be real ones, or promoting the entry would fail later.
  validateTiles(plannedTiles, true);

  try {
    const ref = await tbrCollection(uid).add({
      bookId,
      plannedTiles,
      ...(notes ? { notes } : {}),
      addedAt: FieldValue.serverTimestamp(),
    });
    logEvent('tbr.create', { uid, outcome: 'ok', tbrId: ref.id, bookId });
    return { tbrId: ref.id };
  } catch (error) {
    logFailure('tbr.create', error, { uid, bookId, outcome: 'error' });
    throw new HttpsError('internal', 'Failed to save your reading list.');
  }
}

export async function updateTBREntryHandler(
  request: CallableRequest<unknown>,
): Promise<void> {
  const { uid } = requireAuth(request, 'update your reading list');
  const { tbrId, plannedTiles, notes } = parseRequest(
    UpdateTBRRequestSchema,
    request.data,
  );
  validateTiles(plannedTiles, true);

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
      throw new HttpsError('not-found', 'That entry no longer exists.');
    }
    logFailure('tbr.update', error, { uid, tbrId, outcome: 'error' });
    throw new HttpsError('internal', 'Failed to save your reading list.');
  }

  logEvent('tbr.update', { uid, outcome: 'ok', tbrId });
}

export async function deleteTBREntryHandler(
  request: CallableRequest<unknown>,
): Promise<void> {
  const { uid } = requireAuth(request, 'update your reading list');
  const { tbrId } = parseRequest(DeleteTBRRequestSchema, request.data);

  try {
    await tbrDoc(uid, tbrId).delete();
  } catch (error) {
    logFailure('tbr.delete', error, { uid, tbrId, outcome: 'error' });
    throw new HttpsError('internal', 'Failed to save your reading list.');
  }

  logEvent('tbr.delete', { uid, outcome: 'ok', tbrId });
}

/**
 * Turns a planned entry into a reading, atomically.
 *
 * The reading keeps the entry's id, so a double-submit writes the same document
 * twice instead of creating two readings. The freebie rule is checked in the
 * same transaction as the write, as it is for a plain create.
 */
export async function promoteTBREntryHandler(
  request: CallableRequest<unknown>,
): Promise<{ readingId: string }> {
  const { uid } = requireAuth(request, 'log a reading');
  const { tbrId, bookId, tiles, isFreebie } = parseRequest(
    PromoteTBRRequestSchema,
    request.data,
  );
  validateTiles(tiles, isFreebie);

  const readingRef = readingsCollection(uid).doc(tbrId);
  const entryRef = tbrDoc(uid, tbrId);

  try {
    await db.runTransaction(async (transaction) => {
      const entry = await transaction.get(entryRef);
      if (!entry.exists) {
        throw new HttpsError('not-found', 'That entry no longer exists.');
      }

      const book = await transaction.get(db.collection('books').doc(bookId));
      if (!book.exists) {
        throw new HttpsError('not-found', 'That book is not in the catalog.');
      }

      if (isFreebie) {
        const freebies = await transaction.get(
          readingsCollection(uid).where('isFreebie', '==', true).limit(2),
        );
        if (freebies.docs.some((doc) => doc.id !== tbrId)) {
          throw new HttpsError(
            'failed-precondition',
            'You already have a freebie reading.',
          );
        }
      }

      transaction.set(readingRef, newReadingFields(bookId, tiles, isFreebie));
      transaction.delete(entryRef);
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      logEvent('tbr.promote', {
        uid,
        tbrId,
        outcome: 'rejected',
        code: error.code,
      });
      throw error;
    }
    logFailure('tbr.promote', error, {
      uid,
      tbrId,
      bookId,
      outcome: 'error',
      stage: 'firestore',
    });
    throw new HttpsError('internal', 'Failed to log your reading.');
  }

  logEvent('tbr.promote', {
    uid,
    outcome: 'ok',
    tbrId,
    readingId: readingRef.id,
    bookId,
    tileCount: tiles.length,
    isFreebie,
  });
  return { readingId: readingRef.id };
}

/** Firestore reports an update to a missing document as NOT_FOUND (code 5). */
function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 5;
}
