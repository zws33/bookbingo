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
 * The lowest role that holds each permission. Callers pass the role of an
 * already-verified `active` membership: a missing or non-`active` one is
 * `not-found` at the handler (rule 27) and never reaches this table.
 */
const MINIMUM_ROLE: Record<Permission, MemberRole> = {
  'challenge.read': 'member',
  'reading.write.own': 'member',
  'reading.write.any': 'admin',
  'member.remove': 'admin',
  'member.setRole': 'admin',
  'joinCode.manage': 'admin',
  'tag.write': 'admin',
  // Deleting a tag mid-challenge would drop its `reading_tags` rows and change
  // every member's score. `reading_tags` is `on delete restrict`, so the
  // database refuses that case; this permission only covers a tag with no history.
  'tag.delete': 'admin',
  'config.edit': 'admin',
  'status.change': 'owner',
  'challenge.delete': 'owner',
};

/** Declared apart from the `MEMBER_ROLES` order, which exists for display. */
const RANK: Record<MemberRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function rankOf(role: MemberRole): number {
  return RANK[role];
}

/** Strictly above, so owner-on-owner is false — `canSelfDemote` is the exception. */
export function outranks(role: MemberRole, target: MemberRole): boolean {
  return RANK[role] > RANK[target];
}

export function hasPermission(
  role: MemberRole,
  permission: Permission,
): boolean {
  return RANK[role] >= RANK[MINIMUM_ROLE[permission]];
}

/** Up to and including the actor's own role — inclusive, unlike `outranks`. */
export function canGrant(role: MemberRole, target: MemberRole): boolean {
  return hasPermission(role, 'member.setRole') && RANK[role] >= RANK[target];
}

/**
 * Changing someone else's role needs both rank rules: outrank who they are
 * now and be allowed to grant what they become. Composed here so a
 * handler cannot apply one and forget the other.
 */
export function canSetRole(
  role: MemberRole,
  currentRole: MemberRole,
  newRole: MemberRole,
): boolean {
  return outranks(role, currentRole) && canGrant(role, newRole);
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

export function canRemove(role: MemberRole, target: MemberRole): boolean {
  return hasPermission(role, 'member.remove') && outranks(role, target);
}

export function canEditOthersReading(
  role: MemberRole,
  author: MemberRole,
): boolean {
  return hasPermission(role, 'reading.write.any') && outranks(role, author);
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
] as const;

export type ChallengeAction = (typeof CHALLENGE_ACTIONS)[number];

/**
 * `configEdit` is the locked set — `tagCap`, the tag vocabulary and
 * `freebieRule`; `rename` is separate because `name` stays editable after the
 * rest freezes. `memberManage` covers removal and role changes.
 *
 * Deletion is absent: it survives every status (rule 36), so `remove` consults
 * no gate and a row here would never be read.
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
  },
  active: {
    join: true,
    readingWrite: true,
    configEdit: false,
    rename: true,
    memberManage: true,
  },
  complete: {
    join: false,
    readingWrite: false,
    configEdit: false,
    rename: false,
    memberManage: false,
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
