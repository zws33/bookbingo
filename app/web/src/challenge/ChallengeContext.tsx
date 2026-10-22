import { createContext, use } from 'react';
import type { ChallengeSummary } from '../types/challenges';

export interface ChallengeContextValue {
  challenges: ChallengeSummary[];
  /** The challenge the URL names, once confirmed to be one of ours. */
  active: ChallengeSummary | undefined;
  loading: boolean;
  error: Error | undefined;
}

/**
 * The context and its hooks are kept apart from `ChallengeProvider`, which is
 * the only file that imports `data/challenges`. Reaching that module loads the
 * Firebase client, which throws without the `VITE_FIREBASE_*` config, so a
 * component or test that only consumes the context must not pull it in.
 *
 * Exported for `testing/challenge-utils`, which supplies the value directly so
 * a challenge screen is testable without mocking the membership fetch.
 */
export const ChallengeContext = createContext<
  ChallengeContextValue | undefined
>(undefined);

export function useChallenges(): ChallengeContextValue {
  const value = use(ChallengeContext);
  if (!value) {
    throw new Error('useChallenges must be used within a ChallengeProvider');
  }
  return value;
}

/**
 * The active challenge, for anything rendered under `/c/:challengeId`.
 * `ChallengeLayout` has already resolved it, so this never returns undefined.
 */
export function useActiveChallenge(): ChallengeSummary {
  const { active } = useChallenges();
  if (!active) {
    throw new Error(
      'useActiveChallenge must be used under a resolved /c/:challengeId route',
    );
  }
  return active;
}
