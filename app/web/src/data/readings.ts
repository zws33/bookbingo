import type { Reading } from '@bookbingo/lib-types';

import {
  collection,
  collectionGroup,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  QuerySnapshot,
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

function readingsQuery(userId: string) {
  return query(
    collection(db, 'users', userId, 'readings'),
    orderBy('readAt', 'desc'),
  );
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
