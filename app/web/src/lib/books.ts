import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { log } from '@bookbingo/lib-util';
import { deriveBookId } from '@bookbingo/lib-core';
import { Book, type BookMetadata } from '@bookbingo/lib-types';

interface BookEnrichment {
  /** Open Library Work key, e.g. "/works/OL166894W". */
  externalId: string;
  metadata: BookMetadata;
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
    openLibraryKey: enrichment?.externalId,
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
          openLibrary: { key: enrichment.externalId, enrichedAt: serverTimestamp() },
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

export async function getBook(bookId: string) {
  const snap = await getDoc(doc(db, 'books', bookId));
  if (!snap.exists()) {
    return null;
  }
  return {
    id: snap.id,
    ...snap.data(),
  } as Book;
}

export async function createReading(
  userId: string,
  bookId: string,
  tiles: string[],
  isFreebie: boolean,
): Promise<string> {
  log.debug('books', 'createReading', { bookId, tiles, isFreebie });
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
    log.error('books', error);
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
  log.debug('books', 'updateReading', { readingId, bookId, tiles, isFreebie });
  try {
    await updateDoc(doc(db, 'users', userId, 'readings', readingId), {
      bookId,
      tiles,
      isFreebie,
      updatedAt: serverTimestamp(),
    });
    log.event('update_reading', { reading_id: readingId, book_id: bookId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}

export async function deleteReading(
  userId: string,
  readingId: string,
): Promise<void> {
  log.debug('books', 'deleteReading', { readingId });
  try {
    await deleteDoc(doc(db, 'users', userId, 'readings', readingId));
    log.event('delete_reading', { reading_id: readingId });
  } catch (error) {
    log.error('books', error);
    throw error;
  }
}
