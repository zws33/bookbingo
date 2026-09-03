import type { Reading } from '@bookbingo/lib-types';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { log } from '@bookbingo/lib-util';
import { db } from '../lib/firebase';

export interface ReadingRepository {
  getReadingsByUser(userId: string): Promise<Reading[]>;
  subscribeToReadings(
    userId: string,
    onData: (readings: Reading[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  subscribeToAllReadings(
    onData: (readingsByUser: Map<string, Reading[]>) => void,
    onError: (error: Error) => void,
  ): () => void;
  createReading(
    userId: string,
    bookId: string,
    tiles: string[],
    isFreebie: boolean,
  ): Promise<string>;
  updateReading(
    userId: string,
    readingId: string,
    bookId: string,
    tiles: string[],
    isFreebie: boolean,
  ): Promise<void>;
  deleteReading(userId: string, readingId: string): Promise<void>;
}

/** One-shot fetch. For non-reactive callers (scoring, exports, integration tests). */
export async function getReadingsByUser(userId: string): Promise<Reading[]> {
  const snap = await getDocs(readingsQuery(userId));
  return snap.docs.map(toReading);
}

/**
 * Live subscription. Pushes the full ordered list on every change and returns
 * an unsubscribe function. Primary path for UI hooks.
 */
export function subscribeToReadings(
  userId: string,
  onData: (readings: Reading[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    readingsQuery(userId),
    (snap) => onData(snap.docs.map(toReading)),
    onError,
  );
}

/**
 * Live subscription across every user's readings via the `readings` collection
 * group, grouped by the owning user id. Feeds the leaderboard and library.
 */
export function subscribeToAllReadings(
  onData: (readingsByUser: Map<string, Reading[]>) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    collectionGroup(db, 'readings'),
    (snap) => onData(readingsByUser(snap)),
    onError,
  );
}

export async function createReading(
  userId: string,
  bookId: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  log.debug('readings', 'createReading', { bookId, tiles, isFreebie });
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
    log.error('readings', error);
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
  log.debug('readings', 'updateReading', {
    readingId,
    bookId,
    tiles,
    isFreebie,
  });
  try {
    await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
      bookId,
      tiles,
      isFreebie,
      updatedAt: serverTimestamp(),
    });
    log.event('update_reading', { reading_id: readingId, book_id: bookId });
  } catch (error) {
    log.error('readings', error);
    throw error;
  }
}

export async function deleteReading(
  userId: string,
  readingId: string,
): Promise<void> {
  log.debug('readings', 'deleteReading', { readingId });
  try {
    await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
    log.event('delete_reading', { reading_id: readingId });
  } catch (error) {
    log.error('readings', error);
    throw error;
  }
}

function readingsQuery(userId: string) {
  return query(
    collection(db, 'users', userId, 'readings'),
    orderBy('readAt', 'desc'),
  );
}

/** Groups a collection-group snapshot by the user id in each doc's ref path. */
function readingsByUser(snapshot: QuerySnapshot) {
  const map = new Map<string, Reading[]>();
  if (!snapshot) return map;
  for (const doc of snapshot.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    const reading: Reading = toReading(doc);
    const existing = map.get(userId);
    if (existing) {
      existing.push(reading);
    } else {
      map.set(userId, [reading]);
    }
  }

  return map;
}

function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = doc.data();
  return {
    id: doc.id,
    bookId: data.bookId,
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    readAt: data.readAt?.toDate() ?? new Date(),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate(),
  };
}
