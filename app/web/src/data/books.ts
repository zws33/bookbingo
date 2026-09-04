import type { Book, BookMetadata, ExternalBookIds } from '@bookbingo/lib-types';

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
import { db } from '../lib/firebase';

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
    (snap) => onData(snap.docs.map(toBook)),
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

  // Deterministic id == dedup. If it already exists, reuse it as-is so we don't
  // clobber the original createdBy/createdAt provenance.
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
        externalIds: {
          openLibrary: {
            key: enrichment.externalId,
            enrichedAt: serverTimestamp(),
          },
        },
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

function tsToDate(ts?: { toDate(): Date }): Date {
  return ts?.toDate() ?? new Date();
}

function toBook(doc: QueryDocumentSnapshot): Book {
  const data = doc.data();
  const externalIds = toExternalIds(data.externalIds);
  return {
    id: doc.id,
    title: data.title,
    author: data.author,
    ...(data.metadata !== undefined && { metadata: data.metadata }),
    ...(externalIds && { externalIds }),
    createdBy: data.createdBy,
    createdAt: tsToDate(data.createdAt),
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
      { key: ref.key, enrichedAt: tsToDate(ref.enrichedAt) },
    ]),
  ) as ExternalBookIds;
}
