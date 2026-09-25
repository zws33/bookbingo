import type { ChallengeStatus, MemberRole } from './schema.js';

export const PERMISSIONS = [
  'challenge.read',
  'reading.write.own',
  'reading.write.any',
  'member.remove',
  'member.setRole',
  'joinCode.manage',
  'tag.crud',
  'config.edit',
  'status.change',
  'challenge.delete',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The lowest role that holds each permission.
 */
const MINIMUM_ROLE: Record<Permission, MemberRole> = {
  'challenge.read': 'member',
  'reading.write.own': 'member',
  'reading.write.any': 'admin',
  'member.remove': 'admin',
  'member.setRole': 'admin',
  'joinCode.manage': 'admin',
  'tag.crud': 'admin',
  'config.edit': 'admin',
  'status.change': 'owner',
  'challenge.delete': 'owner',
};

/**
 * The caller, as the permission rules see them.
 *
 * `role` is absent for anyone without an `active` membership. A superadmin
 * holds the claim rather than a member document (rule 31), so the two fields
 * are independent.
 */
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

/** Rule 30: above every role, not a position in the ladder. */
const SUPERADMIN_RANK = Number.POSITIVE_INFINITY;

/** Below every role: outranks nobody, holds nothing. */
const NON_MEMBER_RANK = Number.NEGATIVE_INFINITY;

export function rankOf(actor: Actor): number {
  if (actor.superadmin) return SUPERADMIN_RANK;
  if (actor.role === undefined) return NON_MEMBER_RANK;
  return RANK[actor.role];
}

/** Rule 5: strictly above, so owner-on-owner is false — that is rule 7. */
export function outranks(actor: Actor, target: MemberRole): boolean {
  return rankOf(actor) > RANK[target];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return rankOf(actor) >= RANK[MINIMUM_ROLE[permission]];
}

/** Rule 6: up to and including the actor's own role — inclusive, unlike rule 5. */
export function canGrant(actor: Actor, role: MemberRole): boolean {
  return hasPermission(actor, 'member.setRole') && rankOf(actor) >= RANK[role];
}

/**
 * Changing someone else's role needs both rank rules: outrank who they are
 * now (5) and be allowed to grant what they become (6). Composed here so a
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
 * Rule 7 exempts self-demotion from the rank rules, so an owner may step down
 * without outranking themselves. Promotion is not self-service.
 *
 * Rule 8 — the last owner may not self-demote — counts active owners, so it
 * stays in the write transaction.
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

/** Rule 5 covers another player's readings, not just their membership. */
export function canEditOthersReading(
  actor: Actor,
  author: MemberRole,
): boolean {
  return hasPermission(actor, 'reading.write.any') && outranks(actor, author);
}

/** Rule 28. */
export const MAX_CHALLENGES_CREATED = 5;

/**
 * Rule 26: the cap counts creations, not challenges currently owned, so
 * deleting one does not free a slot (rule 27) and being promoted never
 * consumes one.
 */
export function exceedsCreationCap(
  actor: Actor,
  challengesCreated: number,
): boolean {
  if (actor.superadmin) return false;
  return challengesCreated >= MAX_CHALLENGES_CREATED;
}

/** Rule 29: a custom claim on the verified token. No document read. */
export function isSuperadmin(token: Record<string, unknown>): boolean {
  return token['superadmin'] === true;
}

/**
 * What the lifecycle permits, independent of who is asking. A write needs both
 * this and `can`: `status.change` says an owner may end a challenge, this says
 * an ended one takes no more readings.
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
 * Rules 18 and 21-23. `configEdit` is the locked set — `tagCap`, the tag
 * vocabulary and `freebieRule`; `rename` is separate because rule 22 keeps
 * `name` editable after the rest freezes. `memberManage` covers removal and
 * role changes.
 *
 * Deletion survives `complete` (rules 23-24), so the row is not redundant.
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

/** Rule 20: a linear chain, so there is at most one successor and no way back. */
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
