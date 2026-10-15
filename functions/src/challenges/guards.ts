import { DomainError } from '../common/errors.js';
import {
  canSelfDemote,
  canSetRole,
  canTransition,
  hasPermission,
  outranks,
  statusAllows,
  type Actor,
  type ChallengeAction,
  type Permission,
} from './permissions.js';
import type { ChallengeStatus, MemberRole } from './schema.js';
import type { Challenge, Membership } from './postgresStore.js';

/**
 * Worded identically to the store's not-found message: an outsider must not be
 * able to tell a challenge they cannot see from one that does not exist.
 */
const GONE = 'That challenge no longer exists.';

const DENIED = 'You do not have permission to do that in this challenge.';

const OUTRANKED = 'You cannot act on a member of equal or higher rank.';

/**
 * A non-`active` membership confers nothing, so a `left` or `removed` member is
 * an outsider here (rule 27). Superadmin holds no row at all (rule 42).
 */
export function actorOf(
  membership: Membership | undefined,
  superadmin: boolean,
): Actor {
  return {
    role: membership?.status === 'active' ? membership.role : undefined,
    superadmin,
  };
}

/**
 * The caller's own active row, for the operations that act on it — `leave` and
 * self-demotion. Superadmin has no row and so cannot perform either.
 */
export function requireMembership(
  membership: Membership | undefined,
): Membership {
  if (membership?.status !== 'active') throw new DomainError('not-found', GONE);
  return membership;
}

/**
 * Every guard below starts here, so no path reports `forbidden` to someone who
 * must not learn the challenge exists.
 */
function requireInsider(actor: Actor): void {
  if (!actor.superadmin && actor.role === undefined) {
    throw new DomainError('not-found', GONE);
  }
}

/**
 * An outsider gets `not-found`, so a probe cannot confirm the challenge exists;
 * a member who holds a role but not this permission gets `forbidden`.
 */
export function requirePermission(actor: Actor, permission: Permission): void {
  requireInsider(actor);
  if (!hasPermission(actor, permission)) {
    throw new DomainError('forbidden', DENIED, {
      permission,
      role: actor.role,
    });
  }
}

/** Rule 45: one function to change when a challenge can be read without a membership. */
export function requireReadAccess(actor: Actor): void {
  requirePermission(actor, 'challenge.read');
}

const BLOCKED: Record<ChallengeAction, string> = {
  join: 'be joined',
  readingWrite: 'take reading changes',
  configEdit: 'take configuration changes',
  rename: 'be renamed',
  memberManage: 'take membership changes',
  delete: 'be deleted',
};

/**
 * `conflict`, not `forbidden`: the lifecycle refuses the action for everyone,
 * an owner and superadmin included, so no permission grants it.
 */
export function requireStatus(
  challenge: Challenge,
  action: ChallengeAction,
): void {
  if (!statusAllows(challenge.status, action)) {
    throw new DomainError(
      'conflict',
      `This challenge is ${challenge.status}, so it cannot ${BLOCKED[action]}.`,
      { challengeId: challenge.id, action },
    );
  }
}

/** The chain is one-way, so a backward or skipping move is refused like a frozen one. */
export function requireTransition(
  challenge: Challenge,
  to: ChallengeStatus,
): void {
  if (!canTransition(challenge.status, to)) {
    throw new DomainError(
      'conflict',
      `A ${challenge.status} challenge cannot become ${to}.`,
      { challengeId: challenge.id, from: challenge.status, to },
    );
  }
}

export function requireRemoval(actor: Actor, target: MemberRole): void {
  requirePermission(actor, 'member.remove');
  if (!outranks(actor, target)) {
    throw new DomainError('forbidden', OUTRANKED, { target, role: actor.role });
  }
}

/**
 * The two paths are different rules, not one with an exception: stepping down
 * needs no `member.setRole`, and granting a role needs both rank checks
 * (rules 18 and 19), which `canSetRole` composes.
 */
export function requireRoleChange(
  actor: Actor,
  isSelf: boolean,
  currentRole: MemberRole,
  newRole: MemberRole,
): void {
  requireInsider(actor);

  if (isSelf) {
    if (!canSelfDemote(currentRole, newRole)) {
      throw new DomainError('forbidden', 'You can only lower your own role.', {
        currentRole,
        newRole,
      });
    }
    return;
  }

  requirePermission(actor, 'member.setRole');
  if (!canSetRole(actor, currentRole, newRole)) {
    throw new DomainError('forbidden', OUTRANKED, {
      currentRole,
      newRole,
      role: actor.role,
    });
  }
}

export function requireOwnReadingWrite(actor: Actor): void {
  requirePermission(actor, 'reading.write.own');
}

/** Split from the own-reading guard so neither call site carries an unused argument. */
export function requireOthersReadingWrite(
  actor: Actor,
  authorRole: MemberRole,
): void {
  requirePermission(actor, 'reading.write.any');
  if (!outranks(actor, authorRole)) {
    throw new DomainError('forbidden', OUTRANKED, {
      authorRole,
      role: actor.role,
    });
  }
}

/**
 * Rule 21, over the owner list `listActiveOwners` locked. Call it inside that
 * transaction: outside one the list is a stale read and proves nothing.
 *
 * A caller who is not an active owner cannot threaten the invariant, so they
 * pass without the list having to be filtered first.
 */
export function requireAnotherOwner(
  activeOwnerIds: readonly string[],
  userId: string,
): void {
  if (!activeOwnerIds.includes(userId)) return;
  if (activeOwnerIds.length > 1) return;
  throw new DomainError(
    'conflict',
    'A challenge must keep at least one owner. Promote someone else first.',
    { userId },
  );
}

/** `already-active` is rule 31's no-op: a second join is not an error. */
export type JoinDecision = 'join' | 'already-active';

/**
 * The one guard a non-member is expected to pass, so it checks the membership
 * instead of a permission. Status first, in rule 31's order: a `removed`
 * member of a `complete` challenge is refused by the lifecycle.
 */
export function requireJoinable(
  challenge: Challenge,
  membership: Membership | undefined,
): JoinDecision {
  requireStatus(challenge, 'join');

  if (membership?.status === 'removed') {
    throw new DomainError('forbidden', 'You cannot rejoin this challenge.', {
      challengeId: challenge.id,
    });
  }

  return membership?.status === 'active' ? 'already-active' : 'join';
}
