import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from '@bookbingo/lib-util';

/**
 * Normalizes title and author for case-insensitive lookup, then finds or creates
 * a shared book document in the /books/ collection.
 */
export async function getOrCreateBook(
  title: string,
  author: string,
  createdBy: string,
): Promise<string> {
  const titleLower = title.trim().toLowerCase();
  const authorLower = author.trim().toLowerCase();

  log.debug('books', 'getOrCreateBook', { title, author });

  try {
    const booksRef = collection(db, 'books');
    const q = query(
      booksRef,
      where('titleLower', '==', titleLower),
      where('authorLower', '==', authorLower),
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const bookId = snapshot.docs[0].id;
      log.debug('books', 'found existing book', { bookId });
      return bookId;
    }

    // Not found, create a new one
    const newBookRef = await addDoc(booksRef, {
      title,
      author,
      titleLower,
      authorLower,
      createdBy,
      createdAt: serverTimestamp(),
    });

    log.debug('books', 'created new shared book', { bookId: newBookRef.id });
    return newBookRef.id;
  } catch (error) {
    log.error('books', 'getOrCreateBook error', error);
    throw error;
  }
}

export async function createReading(
  userId: string,
  bookId: string,
  bookTitle: string,
  bookAuthor: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  log.debug('books', 'createReading', { bookId, bookTitle, bookAuthor, tiles, isFreebie });
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
      bookId,
      bookTitle,
      bookAuthor,
      tiles,
      isFreebie,
      readAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    log.event('add_reading', { reading_id: docRef.id, book_id: bookId });
    return docRef.id;
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}

export async function updateReading(
  userId: string,
  readingId: string,
  bookId: string,
  bookTitle: string,
  bookAuthor: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<void> {
  log.debug('books', 'updateReading', { readingId, bookId, bookTitle, bookAuthor, tiles, isFreebie });
  try {
    await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
      bookId,
      bookTitle,
      bookAuthor,
      tiles,
      isFreebie,
      updatedAt: serverTimestamp(),
    });
    log.event('update_reading', { reading_id: readingId, book_id: bookId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}

export async function deleteReading(userId: string, readingId: string): Promise<void> {
  log.debug('books', 'deleteReading', { readingId });
  try {
    await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
    log.event('delete_reading', { reading_id: readingId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}
