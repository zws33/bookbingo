import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from '@bookbingo/lib-util';

export async function getOrCreateBook(
  title: string,
  author: string,
  userId: string,
): Promise<string> {
  const titleLower = title.trim().toLowerCase();
  const authorLower = author.trim().toLowerCase();

  // 1. Try to find existing book (case-insensitive)
  const booksRef = collection(db, 'books');
  const q = query(
    booksRef,
    where('titleLower', '==', titleLower),
    where('authorLower', '==', authorLower),
    limit(1),
  );

  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  // 2. Create new book if not found
  const newBookRef = doc(collection(db, 'books'));
  await setDoc(newBookRef, {
    id: newBookRef.id,
    title: title.trim(),
    author: author.trim(),
    titleLower,
    authorLower,
    createdBy: userId,
    createdAt: serverTimestamp(),
  });

  return newBookRef.id;
}

export async function getBook(bookId: string) {
  const snap = await getDoc(doc(db, 'books', bookId));
  if (!snap.exists()) {
    return null;
  }
  return snap.data();
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
