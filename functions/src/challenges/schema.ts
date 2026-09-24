import z from 'zod/v4';
import { ServerInstant } from '../common/firestoreHelpers.js';

export const CHALLENGE_STATUSES = ['draft', 'active', 'complete'] as const;

export const ChallengeStatusSchema = z.enum(CHALLENGE_STATUSES);

export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

export const ChallengeDocSchema = z.object({
  name: z.string(),
  tagCap: z.number(),
  status: ChallengeStatusSchema,
  createdAt: ServerInstant,
  createdBy: z.string(),
});

/** Highest rank first. Rank comparison lives in the permission map, not here. */
export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;

export const MemberRoleSchema = z.enum(MEMBER_ROLES);

export type MemberRole = z.infer<typeof MemberRoleSchema>;

/** Member docs are never deleted; leaving or removal changes `status`. */
export const MEMBERSHIP_STATUSES = ['active', 'left', 'removed'] as const;

export const MembershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const MembershipDocSchema = z.object({
  userId: z.string().min(1),
  role: MemberRoleSchema,
  status: MembershipStatusSchema,
  joinedAt: ServerInstant,
});

export const CreateChallengeRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tagCap: z.number().int().positive(),
});

export const GetChallengeRequestSchema = z.object({
  challengeId: z.string().min(1),
});
