import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { DomainError } from '../common/errors.js';
import { logEvent, reportWriteFailure } from '../observability.js';
import { hasPermission, statusAllows, type Permission } from './permissions.js';
import {
  CHALLENGE_GONE,
  type ChallengeRepository,
  type Membership,
} from './postgresStore.js';
import {
  toChallengeDTO,
  toMembershipDTO,
  type ChallengeDTO,
  type MembershipDTO,
} from './present.js';
import {
  CreateChallengeRequestSchema,
  GetChallengeRequestSchema,
  UpdateChallengeConfigRequestSchema,
} from './schema.js';

const DENIED = 'You do not have permission to do that in this challenge.';

const RENAME_LOCKED = 'A complete challenge cannot be renamed.';

const CAP_LOCKED =
  'The tag cap cannot change once the challenge has started, because scores already depend on it.';

export interface ChallengeDetailDTO {
  challenge: ChallengeDTO;
  members: MembershipDTO[];
}

export function challengeHandlers(challengesRepo: ChallengeRepository) {
  /**
   * A missing row and a non-`active` one are the same answer (rule 27), and it
   * is worded as a missing challenge so a non-member cannot confirm this one
   * exists (rule 45). Every permission check below reads the role this returns.
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

  return {
    /**
     * No permission check: the challenge does not exist yet, and the creator
     * becomes its sole owner in the same transaction (rule 38).
     */
    async create(
      request: CallableRequest<unknown>,
    ): Promise<{ challengeId: string; joinCode: string }> {
      const { uid } = requireAuth(request, 'create a challenge');
      const { name, tagCap } = parseRequest(
        CreateChallengeRequestSchema,
        request.data,
      );

      let created: { challengeId: string; joinCode: string };
      try {
        created = await challengesRepo.create(uid, { name, tagCap });
      } catch (error) {
        reportWriteFailure(error, 'challenge.create', { uid });
      }

      logEvent('challenge.create', {
        uid,
        outcome: 'ok',
        challengeId: created.challengeId,
      });
      return created;
    },

    /**
     * The roster is the `active` members only. A `left` or `removed` row is
     * kept for their readings (rule 24) and is not part of the membership
     * anyone else can see.
     */
    async get(request: CallableRequest<unknown>): Promise<ChallengeDetailDTO> {
      const { uid } = requireAuth(request, 'load a challenge');
      const { challengeId } = parseRequest(
        GetChallengeRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'challenge.read')) {
        throw denied(membership, 'challenge.read');
      }

      const [challenge, members] = await Promise.all([
        challengesRepo.get(challengeId),
        challengesRepo.listMembers(challengeId),
      ]);

      return {
        challenge: toChallengeDTO(challenge),
        members: members
          .filter((member) => member.status === 'active')
          .map(toMembershipDTO),
      };
    },

    /**
     * `name` and `tagCap` are checked against the lifecycle separately: an
     * `active` challenge takes a rename but not a cap change, so one payload
     * can be half-allowed and the rejection has to say which half.
     *
     * The status is read outside the update, so a transition landing in between
     * can let a rename through a challenge that just completed. The window is
     * one statement and the result is a renamed finished challenge, which is
     * why this is not a transaction.
     */
    async updateConfig(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'change a challenge');
      const { challengeId, name, tagCap } = parseRequest(
        UpdateChallengeConfigRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'config.edit')) {
        throw denied(membership, 'config.edit');
      }

      const { status } = await challengesRepo.get(challengeId);
      if (name !== undefined && !statusAllows(status, 'rename')) {
        throw new DomainError('conflict', RENAME_LOCKED, { status });
      }
      if (tagCap !== undefined && !statusAllows(status, 'configEdit')) {
        throw new DomainError('conflict', CAP_LOCKED, { status });
      }

      try {
        await challengesRepo.update(challengeId, { name, tagCap });
      } catch (error) {
        reportWriteFailure(error, 'challenge.updateConfig', {
          uid,
          challengeId,
        });
      }

      logEvent('challenge.updateConfig', {
        uid,
        outcome: 'ok',
        challengeId,
        renamed: name !== undefined,
        capChanged: tagCap !== undefined,
      });
    },
  };
}
