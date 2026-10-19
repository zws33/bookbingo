import type { ChallengeStatus, MemberRole } from '../types/challenges';

/**
 * A mirror of `functions/src/challenges/permissions.ts`, carrying only what
 * decides whether a control is rendered. The server re-checks every one of
 * these; a client that gets it wrong shows a button that fails, not a
 * privilege. Fold the two together into a shared package when the callables
 * are wired — until then this file is the one that can drift.
 */
const RANK: Record<MemberRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function atLeast(role: MemberRole, minimum: MemberRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export function outranks(role: MemberRole, target: MemberRole): boolean {
  return RANK[role] > RANK[target];
}

export const CHALLENGE_ACTIONS = [
  'join',
  'readingWrite',
  'configEdit',
  'rename',
  'memberManage',
  'delete',
] as const;

export type ChallengeAction = (typeof CHALLENGE_ACTIONS)[number];

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

/** Both gates at once: the role may, and the lifecycle permits. */
export function canEditConfig(
  role: MemberRole,
  status: ChallengeStatus,
): boolean {
  return atLeast(role, 'admin') && statusAllows(status, 'configEdit');
}

export function canRename(role: MemberRole, status: ChallengeStatus): boolean {
  return atLeast(role, 'admin') && statusAllows(status, 'rename');
}

export function canManageMembers(
  role: MemberRole,
  status: ChallengeStatus,
): boolean {
  return atLeast(role, 'admin') && statusAllows(status, 'memberManage');
}

export function canChangeStatus(role: MemberRole): boolean {
  return atLeast(role, 'owner');
}
