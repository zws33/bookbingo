import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { DomainError } from '../common/errors.js';
import { logEvent, reportWriteFailure } from '../observability.js';
import {
  denied,
  requireActiveMembership as requireActiveMembershipOf,
  requireStatusAllows as requireStatusAllowsOf,
} from './access.js';
import {
  canRemove,
  canSelfDemote,
  canSetRole,
  canTransition,
  hasPermission,
  statusAllows,
} from './permissions.js';
import type { ChallengeRepository } from './postgresStore.js';
import {
  toChallengeDTO,
  toChallengeMembershipDTO,
  toMemberDTO,
  type ChallengeDTO,
  type ChallengeMembershipDTO,
  type MemberDTO,
} from './present.js';
import {
  CreateChallengeRequestSchema,
  DeleteChallengeRequestSchema,
  GetChallengeRequestSchema,
  JoinChallengeRequestSchema,
  LeaveChallengeRequestSchema,
  RemoveMemberRequestSchema,
  RotateJoinCodeRequestSchema,
  SetChallengeStatusRequestSchema,
  SetMemberRoleRequestSchema,
  UpdateChallengeConfigRequestSchema,
  type ChallengeStatus,
} from './schema.js';

const RENAME_LOCKED = 'A complete challenge cannot be renamed.';

const CAP_LOCKED =
  'The tag cap cannot change once the challenge has started, because scores already depend on it.';

const CODE_UNKNOWN = 'That join code does not match a challenge.';

const JOIN_CLOSED = 'That challenge is complete and is not taking new members.';

const REJOIN_DENIED = 'You cannot rejoin a challenge you were removed from.';

const MEMBERSHIP_FROZEN = 'A complete challenge cannot be left.';

const MEMBERS_FROZEN =
  'Membership in a complete challenge can no longer change.';

const MEMBER_GONE = 'That member is not in this challenge.';

const NO_JOIN_CODE = 'Challenge has no join_codes row.';

const TRANSITION_DENIED =
  'A challenge moves from draft to active to complete, one step at a time.';

export interface ChallengeDetailDTO {
  challenge: ChallengeDTO;
  members: MemberDTO[];
  /**
   * Always present. A challenge is created with its code in one transaction
   * and loses it only when it is deleted, so an absent one is corrupt state,
   * not a case the response models. Every active member reads it; rotating it
   * is what `joinCode.manage` gates.
   */
  joinCode: string;
}

export function challengeHandlers(challengesRepo: ChallengeRepository) {
  // Bound to this factory's repository so the method bodies read as they did
  // when these were private. Every permission check below reads the role
  // `requireActiveMembership` returns.
  const requireActiveMembership = (challengeId: string, uid: string) =>
    requireActiveMembershipOf(challengesRepo, challengeId, uid);

  const requireStatusAllows = (
    challengeId: string,
    action: 'join' | 'memberManage',
    message: string,
  ) => requireStatusAllowsOf(challengesRepo, challengeId, action, message);

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

    /** Membership is the authorization: the query returns the active ones. */
    async getMyChallenges(
      request: CallableRequest<unknown>,
    ): Promise<{ challenges: ChallengeMembershipDTO[] }> {
      const { uid } = requireAuth(request, 'load your challenges');
      const mine = await challengesRepo.getChallengesByUserId(uid);
      return { challenges: mine.map(toChallengeMembershipDTO) };
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

      const [challenge, members, joinCode] = await Promise.all([
        challengesRepo.get(challengeId),
        challengesRepo.listMembers(challengeId),
        challengesRepo.getJoinCode(challengeId),
      ]);

      if (!joinCode) {
        throw new DomainError('corrupt', NO_JOIN_CODE, { challengeId });
      }

      return {
        challenge: toChallengeDTO(challenge),
        joinCode,
        members: members
          .filter((member) => member.status === 'active')
          .map(toMemberDTO),
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

    /**
     * Rule 31. The code is the authorization, so no permission is checked.
     *
     * The `active` case returns before the upsert, which rewrites role and
     * status and would demote an owner who re-enters their own code.
     */
    async join(
      request: CallableRequest<unknown>,
    ): Promise<{ challengeId: string; alreadyMember: boolean }> {
      const { uid } = requireAuth(request, 'join a challenge');
      const { code } = parseRequest(JoinChallengeRequestSchema, request.data);

      const found = await challengesRepo.findByJoinCode(code);
      if (!found) throw new DomainError('not-found', CODE_UNKNOWN);
      const { challengeId } = found;

      await requireStatusAllows(challengeId, 'join', JOIN_CLOSED);

      const membership = await challengesRepo.getMembership(challengeId, uid);
      if (membership?.status === 'removed') {
        throw new DomainError('forbidden', REJOIN_DENIED);
      }
      if (membership?.status === 'active') {
        logEvent('challenge.join', {
          uid,
          outcome: 'ok',
          challengeId,
          alreadyMember: true,
        });
        return { challengeId, alreadyMember: true };
      }

      try {
        await challengesRepo.upsertMembership(challengeId, uid, {
          role: 'member',
          status: 'active',
        });
      } catch (error) {
        reportWriteFailure(error, 'challenge.join', { uid, challengeId });
      }

      logEvent('challenge.join', {
        uid,
        outcome: 'ok',
        challengeId,
        alreadyMember: false,
        rejoined: membership !== undefined,
      });
      return { challengeId, alreadyMember: false };
    },

    /** The last owner is refused by the repository, inside its write (rule 21). */
    async leave(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'leave a challenge');
      const { challengeId } = parseRequest(
        LeaveChallengeRequestSchema,
        request.data,
      );

      await requireActiveMembership(challengeId, uid);
      await requireStatusAllows(challengeId, 'memberManage', MEMBERSHIP_FROZEN);

      try {
        await challengesRepo.leave(challengeId, uid);
      } catch (error) {
        reportWriteFailure(error, 'challenge.leave', { uid, challengeId });
      }

      logEvent('challenge.leave', { uid, outcome: 'ok', challengeId });
    },

    /**
     * Removal reaches a strictly lower rank only, so it can neither take the
     * last owner nor reach the caller — leaving is `leave`.
     */
    async removeMember(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'remove a member');
      const { challengeId, userId } = parseRequest(
        RemoveMemberRequestSchema,
        request.data,
      );

      const actor = await requireActiveMembership(challengeId, uid);
      await requireStatusAllows(challengeId, 'memberManage', MEMBERS_FROZEN);

      const target = await challengesRepo.getMembership(challengeId, userId);
      if (target?.status !== 'active') {
        throw new DomainError('not-found', MEMBER_GONE);
      }
      if (!canRemove(actor.role, target.role)) {
        throw denied(actor, 'member.remove');
      }

      try {
        await challengesRepo.upsertMembership(challengeId, userId, {
          role: target.role,
          status: 'removed',
        });
      } catch (error) {
        reportWriteFailure(error, 'challenge.removeMember', {
          uid,
          challengeId,
          targetId: userId,
        });
      }

      logEvent('challenge.removeMember', {
        uid,
        outcome: 'ok',
        challengeId,
        targetId: userId,
        targetRole: target.role,
      });
    },

    /**
     * Two rank rules, by target: stepping down is the only change anyone may
     * make to their own role (rule 20), and changing someone else's needs both
     * outranking them and being allowed to grant what they become.
     */
    async setMemberRole(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'change a role');
      const { challengeId, userId, role } = parseRequest(
        SetMemberRoleRequestSchema,
        request.data,
      );

      const actor = await requireActiveMembership(challengeId, uid);
      await requireStatusAllows(challengeId, 'memberManage', MEMBERS_FROZEN);

      const isSelf = userId === uid;
      const target = isSelf
        ? actor
        : await challengesRepo.getMembership(challengeId, userId);
      if (target?.status !== 'active') {
        throw new DomainError('not-found', MEMBER_GONE);
      }

      const allowed = isSelf
        ? canSelfDemote(target.role, role)
        : canSetRole(actor.role, target.role, role);
      if (!allowed) throw denied(actor, 'member.setRole');

      try {
        await challengesRepo.setRole(challengeId, userId, role);
      } catch (error) {
        reportWriteFailure(error, 'challenge.setMemberRole', {
          uid,
          challengeId,
          targetId: userId,
          role,
        });
      }

      logEvent('challenge.setMemberRole', {
        uid,
        outcome: 'ok',
        challengeId,
        targetId: userId,
        role,
      });
    },

    /** Owners only, one step along `draft` → `active` → `complete` (rule 33). */
    async setStatus(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'change a challenge status');
      const { challengeId, status } = parseRequest(
        SetChallengeStatusRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'status.change')) {
        throw denied(membership, 'status.change');
      }

      // A precheck, not the guard: `setStatus` re-applies `canTransition`
      // under a row lock. This read exists so a caller working from a stale
      // view is told which step it asked for rather than that it lost a race.
      const { status: current } = await challengesRepo.get(challengeId);
      if (!canTransition(current, status)) {
        throw new DomainError('conflict', TRANSITION_DENIED, {
          from: current,
          to: status,
        });
      }

      let from: ChallengeStatus;
      try {
        from = await challengesRepo.setStatus(challengeId, status);
      } catch (error) {
        reportWriteFailure(error, 'challenge.setStatus', { uid, challengeId });
      }

      logEvent('challenge.setStatus', {
        uid,
        outcome: 'ok',
        challengeId,
        from,
        to: status,
      });
    },

    /**
     * No lifecycle gate: deletion survives `complete` (rule 36). The
     * repository refuses one whose readings or TBR entries still exist.
     */
    async remove(request: CallableRequest<unknown>): Promise<void> {
      const { uid } = requireAuth(request, 'delete a challenge');
      const { challengeId } = parseRequest(
        DeleteChallengeRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'challenge.delete')) {
        throw denied(membership, 'challenge.delete');
      }

      try {
        await challengesRepo.remove(challengeId);
      } catch (error) {
        reportWriteFailure(error, 'challenge.remove', { uid, challengeId });
      }

      logEvent('challenge.remove', { uid, outcome: 'ok', challengeId });
    },

    /** Gated on `join`: a code for a challenge nobody can join is not worth rotating. */
    async rotateJoinCode(
      request: CallableRequest<unknown>,
    ): Promise<{ joinCode: string }> {
      const { uid } = requireAuth(request, 'replace a join code');
      const { challengeId } = parseRequest(
        RotateJoinCodeRequestSchema,
        request.data,
      );

      const membership = await requireActiveMembership(challengeId, uid);
      if (!hasPermission(membership.role, 'joinCode.manage')) {
        throw denied(membership, 'joinCode.manage');
      }

      await requireStatusAllows(challengeId, 'join', JOIN_CLOSED);

      let joinCode: string;
      try {
        joinCode = await challengesRepo.rotateJoinCode(challengeId, uid);
      } catch (error) {
        reportWriteFailure(error, 'challenge.rotateJoinCode', {
          uid,
          challengeId,
        });
      }

      logEvent('challenge.rotateJoinCode', { uid, outcome: 'ok', challengeId });
      return { joinCode };
    },
  };
}
