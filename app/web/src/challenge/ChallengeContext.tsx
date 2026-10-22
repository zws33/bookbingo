import { createContext, use, type ReactNode } from 'react';
import type { ChallengeSummary } from '../types/challenges';

export interface ChallengeContextValue {
  challenges: ChallengeSummary[];
  /** The challenge currently being viewed, once confirmed to be one of ours. */
  active: ChallengeSummary | undefined;
  loading: boolean;
  error: Error | undefined;
}

const ChallengeContext = createContext<ChallengeContextValue | undefined>(
  undefined,
);

/**
 * The shape the challenge screens consume.
 *
 * The value is still passed in rather than fetched here. `getMyChallenges` is
 * bound in `data/challenges`, but resolving `active` needs the
 * `/c/:challengeId` route that does not exist yet: the URL is what a member
 * can share, so it, not a second store, decides which challenge is open. This
 * provider takes over the query with that route.
 */
export function ChallengeProvider({
  value,
  children,
}: {
  value: ChallengeContextValue;
  children: ReactNode;
}) {
  return <ChallengeContext value={value}>{children}</ChallengeContext>;
}

export function useChallenges(): ChallengeContextValue {
  const value = use(ChallengeContext);
  if (!value) {
    throw new Error('useChallenges must be used within a ChallengeProvider');
  }
  return value;
}

/**
 * The active challenge, for a screen that only renders inside one. The caller
 * above it has already resolved it, so this never returns undefined.
 */
export function useActiveChallenge(): ChallengeSummary {
  const { active } = useChallenges();
  if (!active) {
    throw new Error(
      'useActiveChallenge must be used where a challenge is already resolved',
    );
  }
  return active;
}
