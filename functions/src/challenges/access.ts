import { DomainError } from '../common/errors.js';
import {
  statusAllows,
  type ChallengeAction,
  type Permission,
} from './permissions.js';
import {
  CHALLENGE_GONE,
  type ChallengeRepository,
  type Membership,
} from './postgresStore.js';

/**
 * The three checks every challenge-scoped handler runs, shared so their
 * wording cannot drift between domains. Rule 45 depends on a non-member
 * getting byte-identical answers from every endpoint; a per-module copy of
 * this message is one typo away from turning a read into an existence probe.
 *
 * Deliberately not a guards layer: there is no actor type, no registry and no
 * dispatch. Each handler still names the permission it wants, inline.
 */
export const DENIED =
  'You do not have permission to do that in this challenge.';

/**
 * A missing row and a non-`active` one are the same answer (rule 27), and it
 * is worded as a missing challenge so a non-member cannot confirm this one
 * exists (rule 45).
 */
export async function requireActiveMembership(
  challengesRepo: ChallengeRepository,
  challengeId: string,
  uid: string,
): Promise<Membership> {
  const membership = await challengesRepo.getMembership(challengeId, uid);
  if (membership?.status !== 'active') {
    throw new DomainError('not-found', CHALLENGE_GONE);
  }
  return membership;
}

/** Carries the permission and role as log fields, never to the caller. */
export function denied(
  membership: Membership,
  permission: Permission,
): DomainError {
  return new DomainError('forbidden', DENIED, {
    permission,
    role: membership.role,
  });
}

/**
 * The lifecycle half of a write check. The message is the caller's, because
 * what an `active` challenge refuses differs by action and only the handler
 * knows which one it was attempting.
 */
export async function requireStatusAllows(
  challengesRepo: ChallengeRepository,
  challengeId: string,
  action: ChallengeAction,
  message: string,
): Promise<void> {
  const { status } = await challengesRepo.get(challengeId);
  if (!statusAllows(status, action)) {
    throw new DomainError('conflict', message, { status });
  }
}
