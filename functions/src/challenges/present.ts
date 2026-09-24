import type { Challenge, Membership } from './store.js';
import type {
  ChallengeStatus,
  MemberRole,
  MembershipStatus,
} from './schema.js';

/**
 * Instants are ISO strings, not Dates: the callable protocol encodes responses
 * as JSON, where a Date would arrive as `{}`.
 */
export interface ChallengeDTO {
  id: string;
  name: string;
  status: ChallengeStatus;
  tagCap: number;
  createdBy: string;
  createdAt: string;
}

export function toChallengeDTO(challenge: Challenge): ChallengeDTO {
  return {
    id: challenge.id,
    name: challenge.name,
    status: challenge.status,
    tagCap: challenge.tagCap,
    createdBy: challenge.createdBy,
    createdAt: challenge.createdAt.toISOString(),
  };
}

export interface MembershipDTO {
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string;
}

export function toMembershipDTO(membership: Membership): MembershipDTO {
  return {
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
  };
}
