/**
 * The challenge data seam, not yet connected to anything.
 *
 * `functions/src/challenges/` has handlers for `create`, `get` and
 * `updateConfig` and a `listMyChallenges` store method, but none of them is
 * registered in `functions/src/index.ts`, so there is no callable to bind.
 * These keep the signatures the callables will have and reject until then, so
 * the screens that call them are written against the real shape and the swap
 * is confined to this file.
 */
import type { ChallengeDetail } from '../types/challenges';

const NOT_WIRED = 'Challenges are not available yet.';

export function createChallenge(_input: {
  name: string;
  tagCap: number;
}): Promise<{ challengeId: string; joinCode: string }> {
  return Promise.reject(new Error(NOT_WIRED));
}

export function joinChallenge(_code: string): Promise<{ challengeId: string }> {
  return Promise.reject(new Error(NOT_WIRED));
}

export function getChallenge(_challengeId: string): Promise<ChallengeDetail> {
  return Promise.reject(new Error(NOT_WIRED));
}

export function updateChallengeConfig(_input: {
  challengeId: string;
  name?: string;
  tagCap?: number;
}): Promise<void> {
  return Promise.reject(new Error(NOT_WIRED));
}
