import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure, reportWriteFailure } from '../observability.js';
import {
  DeleteReadingRequestSchema,
  ListReadingsRequestSchema,
  ReadingFieldsSchema,
  UpdateReadingRequestSchema,
} from './schema.js';
import type { UserProfileRepository } from '../users/store.js';
import type { ReadingRepository } from './store.js';
import { toReadingDTO, type ReadingDTO } from './present.js';
import { attachBooks } from '../books/join.js';
import { MissingBookError, type BookRepository } from '../books/store.js';
import { scoreOf, validateReadingTiles, type ScoreDTO } from './validate.js';

export interface LeaderboardRow {
  userId: string;
  name: string;
  photoURL: string | null;
  score: number;
  bookCount: number;
}

export function readingHandlers(
  readingsRepo: ReadingRepository,
  usersRepo: UserProfileRepository,
  booksRepo: BookRepository,
) {
  return {
    /**
     * One user's readings, newest first, with their score.
     *
     * The score ships with the readings it was computed from so the two cannot
     * disagree in the UI — a separate endpoint would let a refetch of one land
     * without the other.
     */
    async list(
      request: CallableRequest<unknown>,
    ): Promise<{ readings: ReadingDTO[]; score: ScoreDTO }> {
      requireAuth(request, 'load readings');
      const { userId } = parseRequest(ListReadingsRequestSchema, request.data);

      const readings = await readingsRepo.list(userId);

      try {
        const joined = await attachBooks(booksRepo, readings);
        return {
          readings: joined.map(toReadingDTO),
          score: scoreOf(readings),
        };
      } catch (error) {
        if (error instanceof MissingBookError) {
          logFailure('reading.list', error, {
            userId,
            outcome: 'error',
            stage: 'join',
            bookIds: error.bookIds,
          });
        }
        throw error;
      }
    },

    /**
     * Scores every user, highest first.
     *
     * Users with no readings still appear, with a zero score.
     */
    async leaderboard(
      request: CallableRequest<unknown>,
    ): Promise<LeaderboardRow[]> {
      requireAuth(request, 'load the leaderboard');

      const [profiles, byUser] = await Promise.all([
        usersRepo.list(),
        readingsRepo.listAllByUser(),
      ]);

      return profiles
        .map((profile) => {
          const readings = byUser.get(profile.id) ?? [];
          return {
            userId: profile.id,
            name: profile.name,
            photoURL: profile.photoURL,
            score: scoreOf(readings).score,
            bookCount: readings.length,
          };
        })
        .sort((a, b) => b.score - a.score);
    },

    async create(
      request: CallableRequest<unknown>,
    ): Promise<{ readingId: string }> {
      const { uid } = requireAuth(request, 'log a reading');
      const { bookId, tiles, isFreebie } = parseRequest(
        ReadingFieldsSchema,
        request.data,
      );
      validateReadingTiles(tiles, isFreebie);

      let readingId: string;
      try {
        readingId = await readingsRepo.create(uid, {
          bookId,
          tiles,
          isFreebie,
        });
      } catch (error) {
        reportWriteFailure(error, 'reading.create', {
          uid,
          bookId,
          tileCount: tiles.length,
        });
      }

      logEvent('reading.create', {
        uid,
        outcome: 'ok',
        readingId,
        bookId,
        tileCount: tiles.length,
        isFreebie,
      });
      return { readingId };
    },

    async update(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'update a reading');
      const { readingId, bookId, tiles, isFreebie } = parseRequest(
        UpdateReadingRequestSchema,
        request.data,
      );
      validateReadingTiles(tiles, isFreebie);

      try {
        await readingsRepo.update(uid, readingId, { bookId, tiles, isFreebie });
      } catch (error) {
        reportWriteFailure(error, 'reading.update', { uid, readingId, bookId });
      }

      logEvent('reading.update', {
        uid,
        outcome: 'ok',
        readingId,
        bookId,
        tileCount: tiles.length,
        isFreebie,
      });
    },

    async remove(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'delete a reading');
      const { readingId } = parseRequest(
        DeleteReadingRequestSchema,
        request.data,
      );

      try {
        await readingsRepo.remove(uid, readingId);
      } catch (error) {
        reportWriteFailure(error, 'reading.delete', { uid, readingId });
      }

      logEvent('reading.delete', { uid, outcome: 'ok', readingId });
    },
  };
}
