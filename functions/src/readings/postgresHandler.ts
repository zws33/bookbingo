import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { MissingBookError } from '../books/errors.js';
import { attachBooks } from '../books/join.js';
import type { BookRepository } from '../books/postgresStore.js';
import { denied, requireActiveMembership } from '../challenges/access.js';
import {
  canEditOthersReading,
  hasPermission,
  statusAllows,
} from '../challenges/permissions.js';
import type {
  Challenge,
  ChallengeRepository,
  Membership,
} from '../challenges/postgresStore.js';
import { DomainError } from '../common/errors.js';
import { logEvent, logFailure, reportWriteFailure } from '../observability.js';
import { toReadingDTO, type ReadingDTO } from './postgresPresent.js';
import type { Reading, ReadingRepository } from './postgresStore.js';
import {
  CreateChallengeReadingRequestSchema,
  DeleteChallengeReadingRequestSchema,
  GetLeaderboardRequestSchema,
  ListChallengeReadingsRequestSchema,
  UpdateChallengeReadingRequestSchema,
} from './schema.js';
import { toScoringInputs, type ScoreDTO } from '../scoring/present.js';
import type { Scorer } from '../scoring/scorer.js';
import { validateReadingTags } from './validate.js';

const READINGS_FROZEN = 'This challenge is not taking readings right now.';

const READING_GONE = 'That reading no longer exists.';

export interface LeaderboardRow {
  userId: string;
  name: string;
  photoURL: string | null;
  score: number;
  bookCount: number;
}

export function readingHandlers(
  readingsRepo: ReadingRepository,
  booksRepo: BookRepository,
  challengesRepo: ChallengeRepository,
  scorer: Scorer,
) {
  /**
   * Returns the challenge rather than only gating on it: every write needs
   * `tagCap` to validate against, and reading it separately would double the
   * query.
   */
  async function requireWritableChallenge(
    challengeId: string,
    uid: string,
  ): Promise<{ membership: Membership; challenge: Challenge }> {
    const membership = await requireActiveMembership(
      challengesRepo,
      challengeId,
      uid,
    );
    if (!hasPermission(membership.role, 'reading.write.own')) {
      throw denied(membership, 'reading.write.own');
    }

    const challenge = await challengesRepo.get(challengeId);
    if (!statusAllows(challenge.status, 'readingWrite')) {
      throw new DomainError('conflict', READINGS_FROZEN, {
        status: challenge.status,
      });
    }

    return { membership, challenge };
  }

  /**
   * Editing someone else's reading needs `reading.write.any` *and* a strictly
   * higher rank than the author (rule 18), so the author's membership is read
   * to compare against. An author who is no longer active has no rank to
   * outrank, and their reading is reported missing rather than edited.
   */
  async function requireEditableReading(
    challengeId: string,
    readingId: string,
    actor: Membership,
  ): Promise<Reading> {
    const reading = await readingsRepo.get(challengeId, readingId);
    if (!reading) throw new DomainError('not-found', READING_GONE);
    if (reading.userId === actor.userId) return reading;

    const author = await challengesRepo.getMembership(
      challengeId,
      reading.userId,
    );
    if (author?.status !== 'active') {
      throw new DomainError('not-found', READING_GONE);
    }
    if (!canEditOthersReading(actor.role, author.role)) {
      throw denied(actor, 'reading.write.any');
    }

    return reading;
  }

  return {
    /**
     * One member's readings, newest first, with their score.
     *
     * The target's membership is checked as well as the caller's: a `left`
     * member's readings stay out of sight until they rejoin (rule 25), and
     * they are not in the roster to navigate to meanwhile.
     */
    async list(
      request: CallableRequest<unknown>,
    ): Promise<{ readings: ReadingDTO[]; score: ScoreDTO }> {
      const { uid } = requireAuth(request, 'load readings');
      const { challengeId, userId } = parseRequest(
        ListChallengeReadingsRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(
        challengesRepo,
        challengeId,
        uid,
      );
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }
      if (userId !== uid) {
        await requireActiveMembership(challengesRepo, challengeId, userId);
      }

      const [readings, scoreOf] = await Promise.all([
        readingsRepo.list(challengeId, userId),
        scorer.forChallenge(challengeId),
      ]);

      try {
        const joined = await attachBooks(booksRepo, readings);
        return {
          readings: joined.map(toReadingDTO),
          score: scoreOf(toScoringInputs(readings)),
        };
      } catch (error) {
        if (error instanceof MissingBookError) {
          logFailure('reading.list', error, {
            challengeId,
            userId,
            outcome: 'error',
            bookIds: error.bookIds,
          });
        }
        throw error;
      }
    },

    /**
     * Scores every active member, highest first. A member with no readings
     * still appears, with a zero score (rule 15).
     */
    async leaderboard(
      request: CallableRequest<unknown>,
    ): Promise<LeaderboardRow[]> {
      const { uid } = requireAuth(request, 'load the leaderboard');
      const { challengeId } = parseRequest(
        GetLeaderboardRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(
        challengesRepo,
        challengeId,
        uid,
      );
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }

      const [members, byUser, scoreOf] = await Promise.all([
        challengesRepo.listMembers(challengeId),
        readingsRepo.listByChallenge(challengeId),
        scorer.forChallenge(challengeId),
      ]);

      return members
        .filter((member) => member.status === 'active')
        .map((member) => {
          const readings = byUser.get(member.userId) ?? [];
          return {
            userId: member.userId,
            name: member.name,
            photoURL: member.photoURL,
            score: scoreOf(toScoringInputs(readings)).score,
            bookCount: readings.length,
          };
        })
        .sort((a, b) => b.score - a.score);
    },

    async create(
      request: CallableRequest<unknown>,
    ): Promise<{ readingId: string }> {
      const { uid } = requireAuth(request, 'log a reading');
      const { challengeId, bookId, tagIds, isFreebie } = parseRequest(
        CreateChallengeReadingRequestSchema,
        request.data,
      );

      const { challenge } = await requireWritableChallenge(challengeId, uid);
      validateReadingTags(tagIds, isFreebie, challenge.tagCap);

      let readingId: string;
      try {
        readingId = await readingsRepo.create(challengeId, uid, {
          bookId,
          tagIds,
          isFreebie,
        });
      } catch (error) {
        reportWriteFailure(error, 'reading.create', {
          uid,
          challengeId,
          bookId,
          tagCount: tagIds.length,
        });
      }

      logEvent('reading.create', {
        uid,
        outcome: 'ok',
        challengeId,
        readingId,
        bookId,
        tagCount: tagIds.length,
        isFreebie,
      });
      return { readingId };
    },

    async update(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'update a reading');
      const { challengeId, readingId, bookId, tagIds, isFreebie } =
        parseRequest(UpdateChallengeReadingRequestSchema, request.data);

      const { membership, challenge } = await requireWritableChallenge(
        challengeId,
        uid,
      );
      const reading = await requireEditableReading(
        challengeId,
        readingId,
        membership,
      );
      validateReadingTags(tagIds, isFreebie, challenge.tagCap);

      try {
        await readingsRepo.update(challengeId, readingId, {
          bookId,
          tagIds,
          isFreebie,
        });
      } catch (error) {
        reportWriteFailure(error, 'reading.update', {
          uid,
          challengeId,
          readingId,
          bookId,
          tagCount: tagIds.length,
        });
      }

      logEvent('reading.update', {
        uid,
        outcome: 'ok',
        challengeId,
        readingId,
        authorId: reading.userId,
      });
    },

    async remove(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'delete a reading');
      const { challengeId, readingId } = parseRequest(
        DeleteChallengeReadingRequestSchema,
        request.data,
      );

      const { membership } = await requireWritableChallenge(challengeId, uid);
      const reading = await requireEditableReading(
        challengeId,
        readingId,
        membership,
      );

      try {
        await readingsRepo.remove(challengeId, readingId);
      } catch (error) {
        reportWriteFailure(error, 'reading.delete', {
          uid,
          challengeId,
          readingId,
        });
      }

      logEvent('reading.delete', {
        uid,
        outcome: 'ok',
        challengeId,
        readingId,
        authorId: reading.userId,
      });
    },
  };
}
