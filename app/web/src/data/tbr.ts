import type { TBREntry } from '@bookbingo/lib-types';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface TBRRepository {
  subscribeToTBR(
    userId: string,
    onData: (entries: TBREntry[]) => void,
    onError: (error: Error) => void,
  ): () => void;
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

function tbrQuery(userId: string) {
  return query(
    collection(db, 'users', userId, 'tbr'),
    orderBy('addedAt', 'desc'),
  );
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
