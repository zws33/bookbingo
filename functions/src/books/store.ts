import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';

/**
 * Books are created by `fetchBookDetails` and `createManualBook`, never by a
 * reading write, so naming a book that does not exist is a bug or a forged
 * payload rather than a race.
 */
export async function requireBookExists(
  transaction: Transaction,
  bookId: string,
): Promise<void> {
  const book = await transaction.get(db.collection('books').doc(bookId));
  if (!book.exists) {
    throw new DomainError('not-found', 'That book is not in the catalog.');
  }
}

/** An existing doc at a derived id is the same book, so it is never overwritten. */
export async function createBookIfAbsent(
  bookId: string,
  data: DocumentData,
): Promise<{ bookId: string; created: boolean }> {
  const bookRef = db.collection('books').doc(bookId);

  let created = false;
  await db.runTransaction(async (transaction) => {
    const existingBook = await transaction.get(bookRef);

    if (!existingBook.exists) {
      transaction.set(bookRef, data);
      created = true;
    }
  });

  return { bookId, created };
}
