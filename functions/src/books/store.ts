import type { DocumentData } from 'firebase-admin/firestore';
import { db } from '../firebase.js';

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
