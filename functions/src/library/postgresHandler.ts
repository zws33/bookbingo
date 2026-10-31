import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { MissingBookError } from '../books/errors.js';
import type { Book, BookRepository } from '../books/postgresStore.js';
import { denied, requireActiveMembership } from '../challenges/access.js';
import { DomainError } from '../common/errors.js';
import { hasPermission } from '../challenges/permissions.js';
import type { ChallengeRepository } from '../challenges/postgresStore.js';
import { ChallengeRef } from '../challenges/schema.js';
import { logFailure } from '../observability.js';
import type { ReadingRepository } from '../readings/postgresStore.js';

const NO_MEMBERSHIP = 'Reading author has no membership row.';

export interface LibraryReader {
  userId: string;
  name: string;
  photoURL: string | null;
  tagIds: string[];
}

export interface LibraryBook {
  book: Book;
  readCount: number;
  uniqueTagIds: string[];
  readers: LibraryReader[];
}

export function libraryHandlers(
  readingsRepo: ReadingRepository,
  booksRepo: BookRepository,
  challengesRepo: ChallengeRepository,
) {
  return {
    /**
     * Every book read in the challenge, with who read it and under which tags.
     *
     * Book-centric on purpose: the library view is a list of books, so the
     * grouping happens here rather than in the client, which would need all
     * readings, all books and all members to assemble the same thing.
     *
     * Books with no readings are left out. They exist when a manual title or
     * author edit re-points a reading at a new book.
     */
    async get(request: CallableRequest<unknown>): Promise<LibraryBook[]> {
      const { uid } = requireAuth(request, 'load the library');
      const { challengeId } = parseRequest(ChallengeRef, request.data);

      const membership = await requireActiveMembership(
        challengesRepo,
        challengeId,
        uid,
      );
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }

      const [members, byUser] = await Promise.all([
        challengesRepo.listMembers(challengeId),
        readingsRepo.listByChallenge(challengeId),
      ]);

      const membersById = new Map(
        members.map((member) => [member.userId, member]),
      );

      const stats = new Map<
        string,
        { readCount: number; tagIds: Set<string>; readers: LibraryReader[] }
      >();

      for (const [userId, readings] of byUser) {
        const member = membersById.get(userId);
        // `listByChallenge` returns active members only and the composite
        // foreign key makes a reading without a membership unstorable, so a
        // reader missing from the roster is corrupt state, not a row to skip.
        if (!member) {
          throw new DomainError('corrupt', NO_MEMBERSHIP, {
            challengeId,
            userId,
          });
        }

        for (const reading of readings) {
          const entry = stats.get(reading.bookId) ?? {
            readCount: 0,
            tagIds: new Set<string>(),
            readers: [],
          };
          entry.readCount += 1;
          for (const tagId of reading.tagIds) entry.tagIds.add(tagId);
          entry.readers.push({
            userId,
            name: member.name,
            photoURL: member.photoURL,
            tagIds: reading.tagIds,
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
            challengeId,
            outcome: 'error',
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
            uniqueTagIds: [...entry.tagIds],
            readers: entry.readers,
          };
        })
        .sort((a, b) => a.book.title.localeCompare(b.book.title));
    },
  };
}
