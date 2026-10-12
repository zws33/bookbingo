import { DomainError } from '../common/errors.js';
import {
  hasPermission,
  statusAllows,
  type Actor,
  type ChallengeAction,
  type Permission,
} from './permissions.js';
import type { Challenge, Membership } from './postgresStore.js';

/**
 * Worded identically to the store's not-found message: an outsider must not be
 * able to tell a challenge they cannot see from one that does not exist.
 */
const GONE = 'That challenge no longer exists.';

const DENIED = 'You do not have permission to do that in this challenge.';

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
 * An outsider gets `not-found`, so a probe cannot confirm the challenge exists;
 * a member who holds a role but not this permission gets `forbidden`.
 */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!actor.superadmin && actor.role === undefined) {
    throw new DomainError('not-found', GONE);
  }
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
