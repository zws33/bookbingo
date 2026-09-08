import type { Book, BookMetadata } from '@bookbingo/lib-types';

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { deriveBookId } from '@bookbingo/lib-core';
import { log } from '@bookbingo/lib-util';
import { db } from '../lib/firebase';
import { BookDocSchema, mapValid } from './schemas';

interface BookEnrichment {
  /** Open Library Work key, e.g. "/works/OL166894W". */
  externalId: string;
  metadata: BookMetadata;
}

export interface BookRepository {
  subscribeToBooks(
    onData: (books: Book[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  getOrCreateBook(
    title: string,
    author: string,
    userId: string,
    enrichment?: BookEnrichment,
  ): Promise<string>;
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

/**
 * Resolve a book to its shared `/books/{bookId}` document, creating it if absent.
 *
 * The document id is deterministic (see @bookbingo/lib-core `deriveBookId`), so
 * this is an idempotent get-or-create rather than a query-then-create: two
 * concurrent calls for the same book target the same id and converge to one
 * document, closing the create race (#7) by construction.
 */
export async function getOrCreateBook(
  title: string,
  author: string,
  userId: string,
  enrichment?: BookEnrichment,
): Promise<string> {
  const bookId = deriveBookId({
    openLibraryKey: enrichment?.externalId ?? null,
    title,
    author,
  });
  const bookRef = doc(db, 'books', bookId);

  const existing = await getDoc(bookRef);
  if (existing.exists()) {
    return bookId;
  }

  await setDoc(
    bookRef,
    {
      title: title.trim(),
      author: author.trim(),
      ...(enrichment && {
        externalIds: { openLibrary: enrichment.externalId },
        metadata: enrichment.metadata,
      }),
      createdBy: userId,
      createdAt: serverTimestamp(),
    },
    // merge so a concurrent create that landed between our getDoc and setDoc
    // isn't fully overwritten (e.g. another provider's externalIds entry).
    { merge: true },
  );

  return bookId;
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
