import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Book } from '@bookbingo/lib-types';
import { requireAuth } from '../callable.js';
import { db } from '../firebase.js';
import { BookDocSchema, mapValid } from '../schemas.js';
import { logWarning } from '../observability.js';
import { listUserProfiles } from '../users/store.js';
import { allReadingsQuery, toReading } from '../readings/store.js';

export interface LibraryReader {
  userId: string;
  name: string;
  photoURL: string | null;
  tiles: string[];
}

export interface LibraryBook {
  book: Book;
  readCount: number;
  uniqueTiles: string[];
  readers: LibraryReader[];
}

/**
 * Every book anyone has read, with who read it and under which tiles.
 *
 * Book-centric on purpose: the library view is a list of books, so the
 * grouping happens here rather than in the client, which used to fetch all
 * readings, all books and all users to assemble the same thing.
 *
 * Books with no readings are left out. They exist when a manual title or
 * author edit re-points a reading at a new book document — see
 * docs/decisions/book-identity-and-deduplication.md.
 */
export async function getLibraryHandler(
  request: CallableRequest<unknown>,
): Promise<LibraryBook[]> {
  requireAuth(request, 'load the library');

  const [profiles, snapshot] = await Promise.all([
    listUserProfiles(),
    allReadingsQuery().get(),
  ]);
  const profilesById = new Map(profiles.map((p) => [p.id, p]));

  const stats = new Map<
    string,
    { readCount: number; tiles: Set<string>; readers: LibraryReader[] }
  >();

  for (const doc of snapshot.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) continue;

    const [reading] = mapValid('readings', [doc], toReading);
    if (!reading) continue;

    const profile = profilesById.get(userId);
    if (!profile) {
      logWarning('library.reader', new Error('No profile for reader'), {
        userId,
        readingId: reading.id,
      });
      continue;
    }

    const entry = stats.get(reading.bookId) ?? {
      readCount: 0,
      tiles: new Set<string>(),
      readers: [],
    };
    entry.readCount += 1;
    for (const tile of reading.tiles) entry.tiles.add(tile);
    entry.readers.push({
      userId,
      name: profile.name,
      photoURL: profile.photoURL,
      tiles: reading.tiles,
    });
    stats.set(reading.bookId, entry);
  }

  const bookIds = [...stats.keys()];
  if (bookIds.length === 0) return [];

  const books = await db.getAll(
    ...bookIds.map((id) => db.collection('books').doc(id)),
  );

  const missing = books.filter((snap) => !snap.exists).map((snap) => snap.id);
  if (missing.length > 0) {
    logWarning('library.books', new Error('No book document'), {
      bookIds: missing,
    });
    throw new HttpsError('internal', 'Could not load the library.');
  }

  return books
    .map((snap) => {
      const data = BookDocSchema.parse(snap.data());
      const entry = stats.get(snap.id);
      return {
        book: {
          id: snap.id,
          title: data.title,
          author: data.author,
          metadata: data.metadata,
        },
        readCount: entry?.readCount ?? 0,
        uniqueTiles: entry ? [...entry.tiles] : [],
        readers: entry?.readers ?? [],
      };
    })
    .sort((a, b) => a.book.title.localeCompare(b.book.title));
}
