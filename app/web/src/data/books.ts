import type { Book } from '@bookbingo/lib-types';

import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  QueryDocumentSnapshot,
  where,
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

// Firestore caps `documentId() in` filters at 30 values per query.
const MAX_IN_CLAUSE_SIZE = 30;

export async function getBooksById(bookIds: string[]): Promise<Book[]> {
  const uniqueIds = [...new Set(bookIds)];
  if (uniqueIds.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += MAX_IN_CLAUSE_SIZE) {
    batches.push(uniqueIds.slice(i, i + MAX_IN_CLAUSE_SIZE));
  }

  const snapshots = await Promise.all(
    batches.map((batch) =>
      getDocs(query(collection(db, 'books'), where(documentId(), 'in', batch))),
    ),
  );
  return mapValid(
    'books',
    snapshots.flatMap((snapshot) => snapshot.docs),
    toBook,
  );
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
    metadata: data.metadata,
  };
}

/**
 * `BookMetadataReadSchema` catches a stored thumbnailUrl that fails `z.url()`
 * (a legacy empty string, most commonly) to null rather than dropping the
 * whole document. Log which books that affects so they can be found and backfilled,
 * without noise for books that simply never had a thumbnail (raw was already
 * null/absent).
 */
function warnIfThumbnailDropped(
  bookId: string,
  raw: unknown,
  parsed: { metadata: { thumbnailUrl: string | null } },
): void {
  const rawThumbnailUrl = (raw as { metadata?: { thumbnailUrl?: unknown } })
    ?.metadata?.thumbnailUrl;
  const hadRawValue = rawThumbnailUrl !== null && rawThumbnailUrl !== undefined;
  if (hadRawValue && parsed.metadata.thumbnailUrl === null) {
    log.warn('books', `dropping invalid thumbnailUrl for book ${bookId}`);
  }
}
