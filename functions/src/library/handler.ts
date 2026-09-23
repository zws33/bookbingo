import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Book } from '@bookbingo/lib-types';
import { requireAuth } from '../callable.js';
import { logFailure, logWarning } from '../observability.js';
import type { UserProfileRepository } from '../users/store.js';
import type { ReadingRepository } from '../readings/store.js';
import { MissingBookError, type BookRepository } from '../books/store.js';

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

export function libraryHandlers(
  readingsRepo: ReadingRepository,
  usersRepo: UserProfileRepository,
  booksRepo: BookRepository,
) {
  return {
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
    async get(request: CallableRequest<unknown>): Promise<LibraryBook[]> {
      requireAuth(request, 'load the library');

      const [profiles, byUser] = await Promise.all([
        usersRepo.list(),
        readingsRepo.listAllByUser(),
      ]);
      const profilesById = new Map(profiles.map((p) => [p.id, p]));

      const stats = new Map<
        string,
        { readCount: number; tiles: Set<string>; readers: LibraryReader[] }
      >();

      for (const [userId, readings] of byUser) {
        const profile = profilesById.get(userId);
        if (!profile) {
          // A reader with no profile document: they signed in but the profile
          // write never landed. Their readings still count toward a book's tiles,
          // but there is no name to show, so the row is left out.
          logWarning('library.reader', new Error('No profile for reader'), {
            userId,
            readingCount: readings.length,
          });
          continue;
        }

        for (const reading of readings) {
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
      }

      let booksById: Map<string, Book>;
      try {
        booksById = await booksRepo.getByIds([...stats.keys()]);
      } catch (error) {
        if (error instanceof MissingBookError) {
          logFailure('library.list', error, {
            outcome: 'error',
            stage: 'join',
            bookIds: error.bookIds,
          });
        }
        throw error;
      }

      return [...stats]
        .map(([bookId, entry]) => {
          const book = booksById.get(bookId);
          if (!book) throw new MissingBookError([bookId]);
          return {
            book,
            readCount: entry.readCount,
            uniqueTiles: [...entry.tiles],
            readers: entry.readers,
          };
        })
        .sort((a, b) => a.book.title.localeCompare(b.book.title));
    },
  };
}
