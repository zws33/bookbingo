import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { logEvent, logFailure } from '../observability.js';
import { readingsCollection } from './store.js';

/**
 * Books are created by `fetchBookDetails` and `createManualBook`, never by a
 * reading write, so naming a book that does not exist is a bug or a forged
 * payload rather than a race.
 */
export async function requireBook(
  transaction: Transaction,
  bookId: string,
): Promise<void> {
  const book = await transaction.get(db.collection('books').doc(bookId));
  if (!book.exists) {
    throw new HttpsError('not-found', 'That book is not in the catalog.');
  }
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
    throw new HttpsError(
      'failed-precondition',
      'You already have a freebie reading.',
    );
  }
}

/** Logs the failure and keeps a deliberate HttpsError intact. */
export function toWriteError(
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
