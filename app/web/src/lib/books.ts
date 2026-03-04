import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from './logger';

export async function createReading(
  userId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  const path = `users/${userId}/readings`;
  log.debug('books', 'createReading', { path, title, tiles, isFreebie });
  const docRef = await addDoc(collection(db, 'users', userId, 'readings'), {
    bookTitle: title,
    bookAuthor: author,
    tiles,
    isFreebie,
    readAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  log.debug('books', 'createReading success', { id: docRef.id });
  return docRef.id;
}

export async function updateReading(
  userId: string,
  readingId: string,
  title: string,
  author: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<void> {
  const path = `users/${userId}/readings/${readingId}`;
  log.debug('books', 'updateReading', { path, title, tiles, isFreebie });
  await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
    bookTitle: title,
    bookAuthor: author,
    tiles,
    isFreebie,
    updatedAt: serverTimestamp(),
  });
  log.debug('books', 'updateReading success', { path });
}

export async function deleteReading(
  userId: string,
  readingId: string,
): Promise<void> {
  const path = `users/${userId}/readings/${readingId}`;
  log.debug('books', 'deleteReading', { path });
  await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
  log.debug('books', 'deleteReading success', { path });
}
