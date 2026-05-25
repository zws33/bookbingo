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
import { Book, type BookMetadata } from '@bookbingo/lib-types';

interface BookEnrichment {
  externalId: string;
  metadata: BookMetadata;
}

export async function getOrCreateBook(
  title: string,
  author: string,
  userId: string,
  enrichment?: BookEnrichment,
): Promise<string> {
  const titleLower = title.trim().toLowerCase();
  const authorLower = author.trim().toLowerCase();
  const booksRef = collection(db, 'books');

  // 1. Deduplicate by externalId when available (more reliable than title/author match)
  if (enrichment) {
    const byExternal = query(
      booksRef,
      where('externalId', '==', enrichment.externalId),
      limit(1),
    );
    const externalSnap = await getDocs(byExternal);
    if (!externalSnap.empty) {
      return externalSnap.docs[0].id;
    }
  }

  // 2. Fall back to case-insensitive title + author match
  const byTitle = query(
    booksRef,
    where('titleLower', '==', titleLower),
    where('authorLower', '==', authorLower),
    limit(1),
  );
  const titleSnap = await getDocs(byTitle);
  if (!titleSnap.empty) {
    return titleSnap.docs[0].id;
  }

  // 3. Create new book
  const newBookRef = doc(collection(db, 'books'));
  await setDoc(newBookRef, {
    title: title.trim(),
    author: author.trim(),
    titleLower,
    authorLower,
    ...(enrichment && {
      externalId: enrichment.externalId,
      metadata: enrichment.metadata,
    }),
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
  return {
    id: snap.id,
    ...snap.data(),
  } as Book;
}

export async function createReading(
  userId: string,
  bookId: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  log.debug('books', 'createReading', { bookId, tiles, isFreebie });
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
      bookId,
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
  tiles: string[],
  isFreebie: boolean,
): Promise<void> {
  log.debug('books', 'updateReading', { readingId, bookId, tiles, isFreebie });
  try {
    await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
      bookId,
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

export async function deleteReading(
  userId: string,
  readingId: string,
): Promise<void> {
  log.debug('books', 'deleteReading', { readingId });
  try {
    await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
    log.event('delete_reading', { reading_id: readingId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}
