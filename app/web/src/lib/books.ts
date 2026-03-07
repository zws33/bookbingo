import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from '@bookbingo/lib-util';

export async function createReading(
  userId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  log.debug('books', 'createReading', { title, tiles, isFreebie });
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
      bookTitle: title,
      bookAuthor: author,
      tiles,
      isFreebie,
      readAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    log.event('add_book', { book_id: docRef.id, book_title: title });
    return docRef.id;
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}

export async function updateReading(
  userId: string,
  readingId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<void> {
  log.debug('books', 'updateReading', { readingId, title, tiles, isFreebie });
  try {
    await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
      bookTitle: title,
      bookAuthor: author,
      tiles,
      isFreebie,
      updatedAt: serverTimestamp(),
    });
    log.event('update_book', { book_id: readingId, book_title: title });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}

export async function deleteReading(userId: string, readingId: string): Promise<void> {
  log.debug('books', 'deleteReading', { readingId });
  try {
    await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
    log.event('delete_book', { book_id: readingId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}
