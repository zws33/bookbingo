import z from 'zod/v4';
import { ServerInstant } from '../common/firestoreHelpers.js';
import { JOIN_CODE_PATTERN, normalizeJoinCode } from './joinCode.js';

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

const ChallengeName = z.string().trim().min(1).max(100);

const TagCap = z.number().int().positive();

/** Every callable but `createChallenge` and `joinChallenge` addresses one challenge. */
const ChallengeRef = z.object({
  challengeId: z.string().trim().min(1),
});

const MemberRef = ChallengeRef.extend({
  userId: z.string().trim().min(1),
});

export const CreateChallengeRequestSchema = z.object({
  name: ChallengeName,
  tagCap: TagCap,
});

/**
 * Aliases while the payload is only the reference. Give one its own object as
 * soon as it takes a field of its own.
 */
export const GetChallengeRequestSchema = ChallengeRef;
export const LeaveChallengeRequestSchema = ChallengeRef;
export const DeleteChallengeRequestSchema = ChallengeRef;
export const RotateJoinCodeRequestSchema = ChallengeRef;
export const RemoveMemberRequestSchema = MemberRef;

export const SetMemberRoleRequestSchema = MemberRef.extend({
  role: MemberRoleSchema,
});

/**
 * Any status parses. Rejecting a backward move here would report it as a
 * malformed payload; `canTransition` knows the current status and can say why.
 */
export const SetChallengeStatusRequestSchema = ChallengeRef.extend({
  status: ChallengeStatusSchema,
});

/**
 * Both fields are optional because the lifecycle unlocks them separately: an
 * `active` challenge takes a rename but not a cap change, and a full
 * replacement could not tell an unchanged cap from an attempted edit.
 */
export const UpdateChallengeConfigRequestSchema = ChallengeRef.extend({
  name: ChallengeName.optional(),
  tagCap: TagCap.optional(),
}).refine(
  (config) => config.name !== undefined || config.tagCap !== undefined,
  'Provide a name or a tag cap to change.',
);

/**
 * Normalized before validation, so handlers and the store only ever see a
 * canonical code and can match it exactly.
 */
export const JoinChallengeRequestSchema = z.object({
  code: z
    .string()
    .transform(normalizeJoinCode)
    .refine((code) => JOIN_CODE_PATTERN.test(code), 'Not a valid join code.'),
});
