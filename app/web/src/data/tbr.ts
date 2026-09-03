import type { TBREntry } from '@bookbingo/lib-types';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function subscribeToTbrEntries(
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
  return query(tbrCollection(userId), orderBy('addedAt', 'desc'));
}

function tbrCollection(userId: string) {
  return collection(db, 'users', userId, 'tbr');
}

function toTBREntry(doc: QueryDocumentSnapshot): TBREntry {
  const data = doc.data();
  return {
    id: doc.id,
    bookId: data.bookId,
    plannedTiles: data.plannedTiles,
    ...(data.notes !== undefined && { notes: data.notes }),
    addedAt: data.addedAt?.toDate() ?? new Date(),
    ...(data.updatedAt?.toDate && { updatedAt: data.updatedAt.toDate() }),
  };
}
