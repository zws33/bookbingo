import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { MissingBookError } from '../books/errors.js';
import { attachBooks } from '../books/join.js';
import type { BookRepository } from '../books/postgresStore.js';
import { denied, requireActiveMembership } from '../challenges/access.js';
import { hasPermission, statusAllows } from '../challenges/permissions.js';
import type {
  Challenge,
  ChallengeRepository,
} from '../challenges/postgresStore.js';
import { DomainError } from '../common/errors.js';
import { logEvent, logFailure, reportWriteFailure } from '../observability.js';
import {
  validateDistinctTags,
  validateReadingTags,
} from '../readings/validate.js';
import { toTBREntryDTO, type TBREntryDTO } from './postgresPresent.js';
import type {
  PromotionOutcome,
  TBREntry,
  TBREntryRepository,
} from './postgresStore.js';
import {
  CreateChallengeTBRRequestSchema,
  DeleteChallengeTBRRequestSchema,
  ListChallengeTBRRequestSchema,
  PromoteChallengeTBRRequestSchema,
  UpdateChallengeTBRRequestSchema,
} from './schema.js';

const ENTRIES_FROZEN =
  'This challenge is not taking reading list changes right now.';

const READINGS_FROZEN = 'This challenge is not taking readings right now.';

const ENTRY_GONE = 'That reading list entry no longer exists.';

export function tbrHandlers(
  tbrRepo: TBREntryRepository,
  booksRepo: BookRepository,
  challengesRepo: ChallengeRepository,
) {
  /**
   * An entry's lifecycle is a reading's lifecycle: both depend on the
   * challenge being `active`. The challenge is returned because `promote`
   * needs `tagCap`, and reading it again would double the query.
   */
  async function requireWritableChallenge(
    challengeId: string,
    uid: string,
    message: string,
  ): Promise<Challenge> {
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
      throw new DomainError('conflict', message, {
        status: challenge.status,
      });
    }

    return challenge;
  }

  /**
   * `update` and `remove` are scoped by challenge and entry id but not by
   * user, so ownership is checked here. A `not-found` rather than a
   * `forbidden`: a reading list is private, and naming the entry would confirm
   * another member planned that book.
   */
  async function requireOwnEntry(
    challengeId: string,
    tbrId: string,
    uid: string,
  ): Promise<TBREntry> {
    const entry = await tbrRepo.get(challengeId, tbrId);
    if (!entry || entry.userId !== uid) {
      throw new DomainError('not-found', ENTRY_GONE);
    }
    return entry;
  }

  return {
    /**
     * The caller's own reading list, newest first.
     *
     * No `userId` parameter: a reading list is private, so there is no way to
     * ask for someone else's.
     */
    async list(request: CallableRequest<unknown>): Promise<TBREntryDTO[]> {
      const { uid } = requireAuth(request, 'load your reading list');
      const { challengeId } = parseRequest(
        ListChallengeTBRRequestSchema,
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

      const entries = await tbrRepo.list(challengeId, uid);

      try {
        return (await attachBooks(booksRepo, entries)).map(toTBREntryDTO);
      } catch (error) {
        if (error instanceof MissingBookError) {
          logFailure('tbr.list', error, {
            uid,
            challengeId,
            outcome: 'error',
            bookIds: error.bookIds,
          });
        }
        throw error;
      }
    },

    /** Planned tags get no cap: a plan is not a reading. */
    async create(
      request: CallableRequest<unknown>,
    ): Promise<{ tbrId: string }> {
      const { uid } = requireAuth(request, 'add to your reading list');
      const { challengeId, bookId, plannedTagIds, notes } = parseRequest(
        CreateChallengeTBRRequestSchema,
        request.data,
      );

      await requireWritableChallenge(challengeId, uid, ENTRIES_FROZEN);
      validateDistinctTags(plannedTagIds);

      let tbrId: string;
      try {
        tbrId = await tbrRepo.create(challengeId, uid, {
          bookId,
          plannedTagIds,
          notes,
        });
      } catch (error) {
        reportWriteFailure(error, 'tbr.create', { uid, challengeId, bookId });
      }

      logEvent('tbr.create', {
        uid,
        outcome: 'ok',
        challengeId,
        tbrId,
        bookId,
      });
      return { tbrId };
    },

    async update(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'update your reading list');
      const { challengeId, tbrId, plannedTagIds, notes } = parseRequest(
        UpdateChallengeTBRRequestSchema,
        request.data,
      );

      await requireWritableChallenge(challengeId, uid, ENTRIES_FROZEN);
      await requireOwnEntry(challengeId, tbrId, uid);
      validateDistinctTags(plannedTagIds);

      try {
        await tbrRepo.update(challengeId, tbrId, { plannedTagIds, notes });
      } catch (error) {
        reportWriteFailure(error, 'tbr.update', { uid, challengeId, tbrId });
      }

      logEvent('tbr.update', { uid, outcome: 'ok', challengeId, tbrId });
    },

    async remove(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'update your reading list');
      const { challengeId, tbrId } = parseRequest(
        DeleteChallengeTBRRequestSchema,
        request.data,
      );

      await requireWritableChallenge(challengeId, uid, ENTRIES_FROZEN);
      await requireOwnEntry(challengeId, tbrId, uid);

      try {
        await tbrRepo.remove(challengeId, tbrId);
      } catch (error) {
        reportWriteFailure(error, 'tbr.delete', { uid, challengeId, tbrId });
      }

      logEvent('tbr.delete', { uid, outcome: 'ok', challengeId, tbrId });
    },

    /** Promotion creates a reading, so the tags have to satisfy the cap. */
    async promote(
      request: CallableRequest<unknown>,
    ): Promise<{ readingId: string }> {
      const { uid } = requireAuth(request, 'log a reading');
      const { challengeId, tbrId, tagIds, isFreebie } = parseRequest(
        PromoteChallengeTBRRequestSchema,
        request.data,
      );

      const challenge = await requireWritableChallenge(
        challengeId,
        uid,
        READINGS_FROZEN,
      );
      validateReadingTags(tagIds, isFreebie, challenge.tagCap);

      let outcome: PromotionOutcome;
      try {
        outcome = await tbrRepo.promote({
          challengeId,
          userId: uid,
          tbrId,
          tagIds,
          isFreebie,
        });
      } catch (error) {
        reportWriteFailure(error, 'tbr.promote', { uid, challengeId, tbrId });
      }

      logEvent('tbr.promote', {
        uid,
        outcome: outcome.alreadyLogged ? 'already-logged' : 'ok',
        challengeId,
        tbrId,
        readingId: outcome.readingId,
        bookId: outcome.bookId,
        tagCount: tagIds.length,
        isFreebie,
      });
      return { readingId: outcome.readingId };
    },
  };
}
