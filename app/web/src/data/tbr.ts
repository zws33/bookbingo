import type { TBREntry } from '@bookbingo/lib-types';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { log } from '@bookbingo/lib-util';
import { db } from '../lib/firebase';
import { readingsCollection, newReadingFields } from './readings';

export interface TBRRepository {
  subscribeToTBR(
    userId: string,
    onData: (entries: TBREntry[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  createTBREntry(
    userId: string,
    bookId: string,
    plannedTiles: string[],
    notes?: string,
  ): Promise<string>;
  updateTBREntry(
    userId: string,
    tbrId: string,
    plannedTiles: string[],
    notes?: string,
  ): Promise<void>;
  deleteTBREntry(userId: string, tbrId: string): Promise<void>;
  promoteTBREntry(
    userId: string,
    tbrId: string,
    bookId: string,
    tiles: string[],
    isFreebie: boolean,
  ): Promise<string>;
}

/**
 * Live subscription to one user's /users/{id}/tbr subcollection, newest first.
 * Pushes the full ordered list on every change and returns an unsubscribe
 * function. Primary path for UI hooks.
 */
export function subscribeToTBR(
  userId: string,
  onData: (entries: TBREntry[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    tbrQuery(userId),
    (snap) => onData(snap.docs.map(toTBREntry)),
    onError,
  );
}

export async function createTBREntry(
  userId: string,
  bookId: string,
  plannedTiles: string[],
  notes?: string,
): Promise<string> {
  try {
    const docRef = await addDoc(tbrCollection(userId), {
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
    await updateDoc(tbrDoc(userId, tbrId), {
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

export async function deleteTBREntry(
  userId: string,
  tbrId: string,
): Promise<void> {
  try {
    await deleteDoc(tbrDoc(userId, tbrId));
    log.event('delete_tbr_entry', { tbr_id: tbrId });
  } catch (error) {
    log.error('tbr', error);
    throw error;
  }
}

/**
 * Atomically creates a Reading and removes the TBR entry in a single batch write.
 * Returns the new readingId.
 *
 * The reading half cannot go through `createReading` — that issues its own
 * write — so it borrows the collection ref and document shape from
 * data/readings.ts rather than restating either here.
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
    const readingRef = doc(readingsCollection(userId), tbrId);

    batch.set(readingRef, newReadingFields(bookId, tiles, isFreebie));
    batch.delete(tbrDoc(userId, tbrId));

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

/** The one place the TBR collection path is written. */
function tbrCollection(userId: string) {
  return collection(db, 'users', userId, 'tbr');
}

function tbrDoc(userId: string, tbrId: string) {
  return doc(db, 'users', userId, 'tbr', tbrId);
}

function tbrQuery(userId: string) {
  return query(tbrCollection(userId), orderBy('addedAt', 'desc'));
}

function toTBREntry(doc: QueryDocumentSnapshot): TBREntry {
  const data = doc.data();
  return {
    id: doc.id, // ID is the key, not a stored field
    bookId: data.bookId,
    plannedTiles: data.plannedTiles,
    ...(data.notes !== undefined && { notes: data.notes }),
    // serverTimestamp() is null in the local snapshot until the write lands;
    // fall back to now so a just-added entry renders instead of throwing.
    addedAt: data.addedAt?.toDate() ?? new Date(),
    ...(data.updatedAt?.toDate && { updatedAt: data.updatedAt.toDate() }),
  };
}
