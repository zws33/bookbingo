export const CHALLENGE_STATUSES = ['draft', 'active', 'complete'] as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/** Highest rank first, for display. Rank comparison lives in `challenge/permissions`. */
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'left', 'removed'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * Mirrors `functions/src/challenges/present.ts`, with instants decoded: the
 * wire carries ISO strings, every other client type holds `Date`.
 */
export interface Challenge {
  id: string;
  name: string;
  status: ChallengeStatus;
  tagCap: number;
  createdBy: string;
  createdAt: Date;
}

export interface Membership {
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: Date;
}

/**
 * The roster renders a person, and the client does not join memberships to
 * profiles, so `getChallenge` carries the name and photo on each row. Named as
 * `UserProfile` names them, not as Firebase Auth does.
 */
export interface Member extends Membership {
  name: string;
  photoURL: string | null;
}

/** One row of the post-sign-in read: the challenge plus the caller's own membership. */
export interface ChallengeSummary {
  challenge: Challenge;
  membership: Membership;
}

export interface ChallengeDetail {
  challenge: Challenge;
  members: Member[];
}
