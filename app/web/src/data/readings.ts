import type { Reading } from '@bookbingo/lib-types';

import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ReadingRepository {
  getReadingsByUser(userId: string): Promise<Reading[]>;
  subscribeToReadings(
    userId: string,
    onData: (readings: Reading[]) => void,
    onError: (error: Error) => void,
  ): () => void;
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

function readingsQuery(userId: string) {
  return query(
    collection(db, 'users', userId, 'readings'),
    orderBy('readAt', 'desc'),
  );
}

function toReading(doc: QueryDocumentSnapshot): Reading {
  const data = doc.data();
  return {
    id: doc.id, // ID is the key, not a stored field
    bookId: data.bookId,
    tiles: data.tiles,
    isFreebie: data.isFreebie,
    // serverTimestamp() is null in the local snapshot until the write lands;
    // fall back to now so a just-added reading renders instead of throwing.
    readAt: data.readAt?.toDate() ?? new Date(),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate(),
  };
}
