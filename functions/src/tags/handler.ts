import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import {
  hasPermission,
  statusAllows,
  type Permission,
} from '../challenges/permissions.js';
import {
  CHALLENGE_GONE,
  type ChallengeRepository,
  type Membership,
} from '../challenges/postgresStore.js';
import { DomainError } from '../common/errors.js';
import { logEvent, reportWriteFailure } from '../observability.js';
import type { Tag, TagRepository } from './postgresStore.js';
import {
  CreateTagRequestSchema,
  DeleteTagRequestSchema,
  ListTagsRequestSchema,
  UpdateTagRequestSchema,
} from './schema.js';

const DENIED = 'You do not have permission to do that in this challenge.';

const VOCABULARY_LOCKED =
  'The tag set cannot change once the challenge has started, because scores already depend on it.';

export function tagHandlers(
  tagsRepo: TagRepository,
  challengesRepo: ChallengeRepository,
) {
  /**
   * A missing row and a non-`active` one are the same answer (rule 27), and it
   * is worded as a missing challenge so a non-member cannot confirm this one
   * exists (rule 45).
   */
  async function requireActiveMembership(
    challengeId: string,
    uid: string,
  ): Promise<Membership> {
    const membership = await challengesRepo.getMembership(challengeId, uid);
    if (membership?.status !== 'active') {
      throw new DomainError('not-found', CHALLENGE_GONE);
    }
    return membership;
  }

  function denied(membership: Membership, permission: Permission): DomainError {
    return new DomainError('forbidden', DENIED, {
      permission,
      role: membership.role,
    });
  }

  /**
   * Every write goes through this in one order: membership, then the
   * permission, then the lifecycle. The status read is last so a non-member
   * cannot learn a challenge's status from which rejection they get.
   */
  async function authorizeWrite(
    challengeId: string,
    uid: string,
    permission: Permission,
  ): Promise<void> {
    const membership = await requireActiveMembership(challengeId, uid);
    if (!hasPermission(membership.role, permission)) {
      throw denied(membership, permission);
    }

    const { status } = await challengesRepo.get(challengeId);
    if (!statusAllows(status, 'configEdit')) {
      throw new DomainError('conflict', VOCABULARY_LOCKED, { status });
    }
  }

  return {
    /** The vocabulary every board, reading and TBR entry in the challenge draws from. */
    async list(request: CallableRequest<unknown>): Promise<{ tags: Tag[] }> {
      const { uid } = requireAuth(request, 'load the tags');
      const { challengeId } = parseRequest(ListTagsRequestSchema, request.data);

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }

      return { tags: await tagsRepo.listByChallenge(challengeId) };
    },

    async create(
      request: CallableRequest<unknown>,
    ): Promise<{ tagId: string }> {
      const { uid } = requireAuth(request, 'add a tag');
      const { challengeId, label } = parseRequest(
        CreateTagRequestSchema,
        request.data,
      );

      await authorizeWrite(challengeId, uid, 'tag.write');

      let tagId: string;
      try {
        tagId = await tagsRepo.create(challengeId, label);
      } catch (error) {
        reportWriteFailure(error, 'tag.create', { uid, challengeId });
      }

      logEvent('tag.create', { uid, outcome: 'ok', challengeId, tagId });
      return { tagId };
    },

    /**
     * Relabelling leaves every `reading_tags` row pointing at the same id, so
     * a rename does not disturb a score.
     */
    async update(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'rename a tag');
      const { challengeId, tagId, label } = parseRequest(
        UpdateTagRequestSchema,
        request.data,
      );

      await authorizeWrite(challengeId, uid, 'tag.write');

      try {
        await tagsRepo.update(challengeId, tagId, label);
      } catch (error) {
        reportWriteFailure(error, 'tag.update', { uid, challengeId, tagId });
      }

      logEvent('tag.update', { uid, outcome: 'ok', challengeId, tagId });
    },

    /**
     * `reading_tags` and `tbr_entry_tags` are `on delete restrict`, so the
     * repository refuses a tag any history still references (rule 8). This
     * reaches only a tag nothing has used.
     */
    async remove(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'delete a tag');
      const { challengeId, tagId } = parseRequest(
        DeleteTagRequestSchema,
        request.data,
      );

      await authorizeWrite(challengeId, uid, 'tag.delete');

      try {
        await tagsRepo.remove(challengeId, tagId);
      } catch (error) {
        reportWriteFailure(error, 'tag.delete', { uid, challengeId, tagId });
      }

      logEvent('tag.delete', { uid, outcome: 'ok', challengeId, tagId });
    },
  };
}
