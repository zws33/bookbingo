import type { Book, ExternalBookIds } from '@bookbingo/lib-types';

import {
  collection,
  onSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface BookRepository {
  subscribeToBooks(
    onData: (books: Book[]) => void,
    onError: (error: Error) => void,
  ): () => void;
}

/**
 * Live subscription to the shared /books collection. Pushes the full list on
 * every change and returns an unsubscribe function. Primary path for UI hooks.
 */
export function subscribeToBooks(
  onData: (books: Book[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'books'),
    (snap) => onData(snap.docs.map(toBook)),
    onError,
  );
}

function toBook(doc: QueryDocumentSnapshot): Book {
  const data = doc.data();
  const externalIds = toExternalIds(data.externalIds);
  return {
    id: doc.id, // ID is the key, not a stored field
    title: data.title,
    author: data.author,
    metadata: data.metadata,
    ...(externalIds && { externalIds }),
    createdBy: data.createdBy,
    // serverTimestamp() is null in the local snapshot until the write lands;
    // fall back to now so a just-added book renders instead of throwing.
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

function toExternalIds(
  externalIds:
    | Record<string, { key: string; enrichedAt?: { toDate(): Date } }>
    | undefined,
): ExternalBookIds | undefined {
  if (!externalIds) return undefined;

  return Object.fromEntries(
    Object.entries(externalIds).map(([provider, ref]) => [
      provider,
      { key: ref.key, enrichedAt: ref.enrichedAt?.toDate() ?? new Date() },
    ]),
  ) as ExternalBookIds;
}
