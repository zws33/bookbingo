import z from 'zod/v4';
import { createCallable } from '../lib/callable';
import type {
  ChallengeDetail,
  ChallengeStatus,
  ChallengeSummary,
} from '../types/challenges';
import {
  CreateChallengeResponseSchema,
  GetChallengeResponseSchema,
  GetMyChallengesResponseSchema,
  JoinChallengeResponseSchema,
} from '../types/schemas';

const VoidResponseSchema = z.unknown().transform(() => undefined);

/**
 * The challenges the caller is an active member of, newest membership first.
 * A removed or departed member sees nothing, so this doubles as the check that
 * a challenge is still theirs.
 */
export const getMyChallenges = createCallable<
  void,
  { challenges: ChallengeSummary[] }
>('getMyChallenges', GetMyChallengesResponseSchema);

/** The caller becomes the sole owner, and the join code is returned once. */
export const createChallenge = createCallable<
  { name: string; tagCap: number },
  { challengeId: string; joinCode: string }
>('createChallenge', CreateChallengeResponseSchema);

const callJoinChallenge = createCallable<
  { code: string },
  { challengeId: string }
>('joinChallenge', JoinChallengeResponseSchema);

/** The code is the authorization: no challengeId, because the caller has none yet. */
export function joinChallenge(code: string): Promise<{ challengeId: string }> {
  return callJoinChallenge({ code });
}

const callGetChallenge = createCallable<
  { challengeId: string },
  ChallengeDetail
>('getChallenge', GetChallengeResponseSchema);

/** The challenge with its active roster. A non-member gets `not-found`. */
export function getChallenge(challengeId: string): Promise<ChallengeDetail> {
  return callGetChallenge({ challengeId });
}

/**
 * A rename and a cap change travel together but are authorized separately: an
 * active challenge takes the rename and refuses the cap change.
 */
export const updateChallengeConfig = createCallable<
  { challengeId: string; name?: string; tagCap?: number },
  undefined
>('updateChallengeConfig', VoidResponseSchema);

/**
 * One step along `draft` → `active` → `complete`, owners only. The server
 * re-reads the current status under a lock, so a stale view is refused rather
 * than applied.
 */
export const setChallengeStatus = createCallable<
  { challengeId: string; status: ChallengeStatus },
  undefined
>('setChallengeStatus', VoidResponseSchema);

/**
 * Refused while any reading or TBR entry still references the challenge —
 * nothing in its subtree is deleted implicitly.
 */
export const deleteChallenge = createCallable<
  { challengeId: string },
  undefined
>('deleteChallenge', VoidResponseSchema);

/** Refused for the last active owner. Readings stay, excluded from scores. */
export const leaveChallenge = createCallable<
  { challengeId: string },
  undefined
>('leaveChallenge', VoidResponseSchema);

/**
 * Replaces the live code and returns the new one. There is no revoke without
 * replacement: a challenge always has exactly one code.
 */
export const rotateJoinCode = createCallable<
  { challengeId: string },
  { joinCode: string }
>('rotateJoinCode', z.object({ joinCode: z.string().min(1) }));
