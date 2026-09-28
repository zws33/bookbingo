import type { ChallengeStatus, MemberRole } from './schema.js';

export const PERMISSIONS = [
  'challenge.read',
  'reading.write.own',
  'reading.write.any',
  'member.remove',
  'member.setRole',
  'joinCode.manage',
  'tag.write',
  'tag.delete',
  'config.edit',
  'status.change',
  'challenge.delete',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The lowest role that holds each permission. `'superadmin'` is not a
 * `MemberRole` — it widens this table rather than adding a side-channel
 * predicate, so this stays the single place a handler needs to check.
 */
const MINIMUM_ROLE: Record<Permission, MemberRole | 'superadmin'> = {
  'challenge.read': 'member',
  'reading.write.own': 'member',
  'reading.write.any': 'admin',
  'member.remove': 'admin',
  'member.setRole': 'admin',
  'joinCode.manage': 'admin',
  'tag.write': 'admin',
  // Deleting a tag mid-challenge silently drops its `reading_tags` rows and
  // changes every member's score. Superadmin-only until a tag-deletion
  // policy exists.
  'tag.delete': 'superadmin',
  'config.edit': 'admin',
  'status.change': 'owner',
  'challenge.delete': 'owner',
};

export interface Actor {
  readonly role: MemberRole | undefined;
  readonly superadmin: boolean;
}

/** Declared apart from the `MEMBER_ROLES` order, which exists for display. */
const RANK: Record<MemberRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/** Above every role, not a position in the ladder. */
const SUPERADMIN_RANK = Number.POSITIVE_INFINITY;

/** Below every role: outranks nobody, holds nothing. */
const NON_MEMBER_RANK = Number.NEGATIVE_INFINITY;

export function rankOf(actor: Actor): number {
  if (actor.superadmin) return SUPERADMIN_RANK;
  if (actor.role === undefined) return NON_MEMBER_RANK;
  return RANK[actor.role];
}

/** Strictly above, so owner-on-owner is false — `canSelfDemote` is the exception. */
export function outranks(actor: Actor, target: MemberRole): boolean {
  return rankOf(actor) > RANK[target];
}

/** `MINIMUM_ROLE` values are ranked the same way actors are, so the two compare directly. */
function rankOfMinimum(minimum: MemberRole | 'superadmin'): number {
  return minimum === 'superadmin' ? SUPERADMIN_RANK : RANK[minimum];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return rankOf(actor) >= rankOfMinimum(MINIMUM_ROLE[permission]);
}

/** Up to and including the actor's own role — inclusive, unlike `outranks`. */
export function canGrant(actor: Actor, role: MemberRole): boolean {
  return hasPermission(actor, 'member.setRole') && rankOf(actor) >= RANK[role];
}

/**
 * Changing someone else's role needs both rank rules: outrank who they are
 * now and be allowed to grant what they become. Composed here so a
 * handler cannot apply one and forget the other.
 */
export function canSetRole(
  actor: Actor,
  currentRole: MemberRole,
  newRole: MemberRole,
): boolean {
  return outranks(actor, currentRole) && canGrant(actor, newRole);
}

/**
 * An owner may step down without outranking themselves. Promotion is not self-service.
 */
export function canSelfDemote(
  currentRole: MemberRole,
  newRole: MemberRole,
): boolean {
  return RANK[newRole] < RANK[currentRole];
}

export function canRemove(actor: Actor, target: MemberRole): boolean {
  return hasPermission(actor, 'member.remove') && outranks(actor, target);
}

export function canEditOthersReading(
  actor: Actor,
  author: MemberRole,
): boolean {
  return hasPermission(actor, 'reading.write.any') && outranks(actor, author);
}

/** A custom claim on the verified token. No document read. */
export function isSuperadmin(token: Record<string, unknown>): boolean {
  return token['superadmin'] === true;
}

/**
 * What the lifecycle permits, independent of who is asking. A write needs both
 * this and `hasPermission`: `status.change` says an owner may end a challenge,
 * this says an ended one takes no more readings.
 */
export const CHALLENGE_ACTIONS = [
  'join',
  'readingWrite',
  'configEdit',
  'rename',
  'memberManage',
  'delete',
] as const;

export type ChallengeAction = (typeof CHALLENGE_ACTIONS)[number];

/**
 * `configEdit` is the locked set — `tagCap`, the tag vocabulary and
 * `freebieRule`; `rename` is separate because `name` stays editable after the
 * rest freezes. `memberManage` covers removal and role changes.
 *
 * Deletion survives `complete`, so that row is not redundant.
 */
const STATUS_ALLOWS: Record<
  ChallengeStatus,
  Record<ChallengeAction, boolean>
> = {
  draft: {
    join: true,
    readingWrite: false,
    configEdit: true,
    rename: true,
    memberManage: true,
    delete: true,
  },
  active: {
    join: true,
    readingWrite: true,
    configEdit: false,
    rename: true,
    memberManage: true,
    delete: true,
  },
  complete: {
    join: false,
    readingWrite: false,
    configEdit: false,
    rename: false,
    memberManage: false,
    delete: true,
  },
};

export function statusAllows(
  status: ChallengeStatus,
  action: ChallengeAction,
): boolean {
  return STATUS_ALLOWS[status][action];
}

/** A linear chain, so there is at most one successor and no way back. */
const NEXT_STATUS: Record<ChallengeStatus, ChallengeStatus | undefined> = {
  draft: 'active',
  active: 'complete',
  complete: undefined,
};

export function canTransition(
  from: ChallengeStatus,
  to: ChallengeStatus,
): boolean {
  return NEXT_STATUS[from] === to;
}
