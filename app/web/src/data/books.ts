import type { Book } from '@bookbingo/lib-types';

import {
  collection,
  onSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { log } from '@bookbingo/lib-util';
import { db } from '../lib/firebase';
import { BookDocSchema, mapValid } from './schemas';

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
    (snap) => onData(mapValid('books', snap.docs, toBook)),
    onError,
  );
}

function toBook(doc: QueryDocumentSnapshot): Book {
  const raw = doc.data();
  const data = BookDocSchema.parse(raw);
  warnIfThumbnailDropped(doc.id, raw, data);
  return {
    id: doc.id,
    title: data.title,
    author: data.author,
    ...(data.metadata !== undefined && { metadata: data.metadata }),
    ...(data.externalIds !== undefined && { externalIds: data.externalIds }),
    ...(data.createdBy !== undefined && { createdBy: data.createdBy }),
    ...(data.createdAt !== undefined && { createdAt: data.createdAt }),
  };
}

/**
 * `BookDocSchema` coerces a stored thumbnailUrl that fails `z.url()` (a
 * legacy empty string, most commonly) to null rather than dropping the whole
 * document. Log which books that affects so they can be found and backfilled,
 * without noise for books that simply never had a thumbnail (raw was already
 * null/absent).
 */
function warnIfThumbnailDropped(
  bookId: string,
  raw: unknown,
  parsed: { metadata?: { thumbnailUrl: string | null } | undefined },
): void {
  const rawThumbnailUrl = (raw as { metadata?: { thumbnailUrl?: unknown } })
    ?.metadata?.thumbnailUrl;
  const hadRawValue = rawThumbnailUrl !== null && rawThumbnailUrl !== undefined;
  if (hadRawValue && parsed.metadata?.thumbnailUrl === null) {
    log.warn('books', `dropping invalid thumbnailUrl for book ${bookId}`);
  }
}
