import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import z from 'zod/v4';
import { db } from '../firebase.js';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure } from '../observability.js';
import { mapValid } from '../schemas.js';
import { listUserProfiles } from '../users/store.js';
import {
  allReadingsQuery,
  newReadingFields,
  readingDoc,
  readingsCollection,
  toReading,
  type Reading,
  type ReadingDTO,
} from './store.js';
import { MissingBookError, withBooks } from '../books/join.js';
import { scoreOf, validateTiles, type ScoreDTO } from './validate.js';

const ListReadingsRequestSchema = z.object({
  userId: z.string().trim().min(1),
});

const ReadingFieldsSchema = z.object({
  bookId: z.string().trim().min(1),
  tiles: z.array(z.string().trim().min(1)),
  isFreebie: z.boolean(),
});

const UpdateReadingRequestSchema = ReadingFieldsSchema.extend({
  readingId: z.string().trim().min(1),
});

const DeleteReadingRequestSchema = z.object({
  readingId: z.string().trim().min(1),
});

/**
 * One user's readings, newest first, with their score.
 *
 * The score ships with the readings it was computed from so the two cannot
 * disagree in the UI — a separate endpoint would let a refetch of one land
 * without the other.
 */
export async function listReadingsHandler(
  request: CallableRequest<unknown>,
): Promise<{ readings: ReadingDTO[]; score: ScoreDTO }> {
  requireAuth(request, 'load readings');
  const { userId } = parseRequest(ListReadingsRequestSchema, request.data);

  const snapshot = await readingsCollection(userId)
    .orderBy('readAt', 'desc')
    .get();
  const readings = mapValid('readings', snapshot.docs, toReading);

  try {
    return { readings: await withBooks(readings), score: scoreOf(readings) };
  } catch (error) {
    if (error instanceof MissingBookError) {
      logFailure('reading.list', error, {
        userId,
        outcome: 'error',
        stage: 'join',
        bookIds: error.bookIds,
      });
      throw new HttpsError('internal', 'Could not load those readings.');
    }
    throw error;
  }
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  photoURL: string | null;
  score: number;
  bookCount: number;
}

/**
 * Scores every user, highest first.
 *
 * Users with no readings still appear, with a zero score, which is what the
 * client's join of the users collection and the readings group produced.
 */
export async function getLeaderboardHandler(
  request: CallableRequest<unknown>,
): Promise<LeaderboardRow[]> {
  requireAuth(request, 'load the leaderboard');

  const [profiles, readingsSnapshot] = await Promise.all([
    listUserProfiles(),
    allReadingsQuery().get(),
  ]);

  const byUser = new Map<string, Reading[]>();
  for (const doc of readingsSnapshot.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    const [reading] = mapValid('readings', [doc], toReading);
    if (!reading) continue;

    const existing = byUser.get(userId);
    if (existing) existing.push(reading);
    else byUser.set(userId, [reading]);
  }

  return profiles
    .map((profile) => {
      const readings = byUser.get(profile.id) ?? [];
      return {
        userId: profile.id,
        name: profile.name,
        photoURL: profile.photoURL,
        score: scoreOf(readings).score,
        bookCount: readings.length,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export async function createReadingHandler(
  request: CallableRequest<unknown>,
): Promise<{ readingId: string }> {
  const { uid } = requireAuth(request, 'log a reading');
  const { bookId, tiles, isFreebie } = parseRequest(
    ReadingFieldsSchema,
    request.data,
  );
  validateTiles(tiles, isFreebie);

  const ref = readingsCollection(uid).doc();

  try {
    await db.runTransaction(async (transaction) => {
      await requireBook(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, ref.id);
      transaction.set(ref, newReadingFields(bookId, tiles, isFreebie));
    });
  } catch (error) {
    throw toWriteError(error, 'reading.create', {
      uid,
      bookId,
      tileCount: tiles.length,
    });
  }

  logEvent('reading.create', {
    uid,
    outcome: 'ok',
    readingId: ref.id,
    bookId,
    tileCount: tiles.length,
    isFreebie,
  });
  return { readingId: ref.id };
}

export async function updateReadingHandler(
  request: CallableRequest<unknown>,
): Promise<void> {
  const { uid } = requireAuth(request, 'update a reading');
  const { readingId, bookId, tiles, isFreebie } = parseRequest(
    UpdateReadingRequestSchema,
    request.data,
  );
  validateTiles(tiles, isFreebie);

  const ref = readingDoc(uid, readingId);

  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      // The path is built from the caller's own uid, so another user's reading
      // id simply does not resolve — there is nothing to leak here.
      if (!existing.exists) {
        throw new HttpsError('not-found', 'That reading no longer exists.');
      }
      await requireBook(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, readingId);

      transaction.update(ref, {
        bookId,
        tiles,
        isFreebie,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    throw toWriteError(error, 'reading.update', { uid, readingId, bookId });
  }

  logEvent('reading.update', {
    uid,
    outcome: 'ok',
    readingId,
    bookId,
    tileCount: tiles.length,
    isFreebie,
  });
}

export async function deleteReadingHandler(
  request: CallableRequest<unknown>,
): Promise<void> {
  const { uid } = requireAuth(request, 'delete a reading');
  const { readingId } = parseRequest(DeleteReadingRequestSchema, request.data);

  try {
    await readingDoc(uid, readingId).delete();
  } catch (error) {
    throw toWriteError(error, 'reading.delete', { uid, readingId });
  }

  logEvent('reading.delete', { uid, outcome: 'ok', readingId });
}

/**
 * Books are created by `fetchBookDetails` and `createManualBook`, never by a
 * reading write, so a reading naming a book that does not exist is a bug or a
 * forged payload rather than a race.
 */
async function requireBook(
  transaction: Transaction,
  bookId: string,
): Promise<void> {
  const book = await transaction.get(db.collection('books').doc(bookId));
  if (!book.exists) {
    throw new HttpsError('not-found', 'That book is not in the catalog.');
  }
}

/** At most one freebie per user — the rule `validateFreebie` states. */
async function requireNoOtherFreebie(
  transaction: Transaction,
  uid: string,
  readingId: string,
): Promise<void> {
  const freebies = await transaction.get(
    readingsCollection(uid).where('isFreebie', '==', true).limit(2),
  );
  const other = freebies.docs.find((doc) => doc.id !== readingId);
  if (other) {
    throw new HttpsError(
      'failed-precondition',
      'You already have a freebie reading.',
    );
  }
}

/** Logs the failure and keeps a deliberate HttpsError intact. */
function toWriteError(
  error: unknown,
  event: string,
  fields: Record<string, unknown>,
): HttpsError {
  if (error instanceof HttpsError) {
    logEvent(event, { ...fields, outcome: 'rejected', code: error.code });
    return error;
  }
  logFailure(event, error, { ...fields, outcome: 'error', stage: 'firestore' });
  return new HttpsError('internal', 'Failed to save your reading.');
}
