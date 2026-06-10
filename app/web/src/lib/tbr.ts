import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from '@bookbingo/lib-util';

export async function createTBREntry(
  userId: string,
  bookId: string,
  plannedTiles: string[],
  notes?: string,
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'tbr'), {
      bookId,
      plannedTiles,
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
      addedAt: serverTimestamp(),
    });
    log.event('add_tbr_entry', { tbr_id: docRef.id, book_id: bookId });
    return docRef.id;
  } catch (error) {
    log.error('tbr', error);
    throw error;
  }
}

export async function updateTBREntry(
  userId: string,
  tbrId: string,
  plannedTiles: string[],
  notes?: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userId, 'tbr', tbrId), {
      plannedTiles,
      notes: notes?.trim() || deleteField(),
      updatedAt: serverTimestamp(),
    });
    log.event('update_tbr_entry', { tbr_id: tbrId });
  } catch (error) {
    log.error('tbr', error);
    throw error;
  }
}

export async function deleteTBREntry(userId: string, tbrId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', userId, 'tbr', tbrId));
    log.event('delete_tbr_entry', { tbr_id: tbrId });
  } catch (error) {
    log.error('tbr', error);
    throw error;
  }
}

/**
 * Atomically creates a Reading and removes the TBR entry in a single batch write.
 * Returns the new readingId.
 */
export async function promoteTBREntry(
  userId: string,
  tbrId: string,
  bookId: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  try {
    const batch = writeBatch(db);
    const readingRef = doc(collection(db, 'users', userId, 'readings'));
    const tbrRef = doc(db, 'users', userId, 'tbr', tbrId);

    batch.set(readingRef, {
      bookId,
      tiles,
      isFreebie,
      readAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    batch.delete(tbrRef);

    await batch.commit();
    log.event('promote_tbr_entry', {
      tbr_id: tbrId,
      reading_id: readingRef.id,
      book_id: bookId,
    });
    return readingRef.id;
  } catch (error) {
    log.error('tbr', error);
    throw error;
  }
}
