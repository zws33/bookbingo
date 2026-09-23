import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure, reportWriteFailure } from '../observability.js';
import { DomainError } from '../common/errors.js';
import { mapValid } from '../common/firestoreDoc.js';
import {
  DeleteReadingRequestSchema,
  ListReadingsRequestSchema,
  ReadingFieldsSchema,
  UpdateReadingRequestSchema,
} from './schema.js';
import { listUserProfiles } from '../users/store.js';
import {
  allReadingsQuery,
  newReadingFields,
  readingDoc,
  readingsByUser,
  readingsCollection,
  requireNoOtherFreebie,
  toReading,
  type ReadingDTO,
} from './store.js';
import { MissingBookError, withBooks } from '../books/join.js';
import { requireBookExists } from '../books/store.js';
import { scoreOf, validateReadingTiles, type ScoreDTO } from './validate.js';

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

  const byUser = readingsByUser(readingsSnapshot.docs);

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
  validateReadingTiles(tiles, isFreebie);

  const ref = readingsCollection(uid).doc();

  try {
    await db.runTransaction(async (transaction) => {
      await requireBookExists(transaction, bookId);
      if (isFreebie) await requireNoOtherFreebie(transaction, uid, ref.id);
      transaction.set(ref, newReadingFields(bookId, tiles, isFreebie));
    });
  } catch (error) {
    reportWriteFailure(error, 'reading.create', {
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
  validateReadingTiles(tiles, isFreebie);

  const ref = readingDoc(uid, readingId);

  try {
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
  } catch (error) {
    reportWriteFailure(error, 'reading.update', { uid, readingId, bookId });
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
    reportWriteFailure(error, 'reading.delete', { uid, readingId });
  }

  logEvent('reading.delete', { uid, outcome: 'ok', readingId });
}
