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
 * The shape the challenge screens consume, with no data source behind it yet.
 *
 * The value is passed in rather than fetched because the membership read has
 * no callable to call: `functions/src/challenges/` has a `listMyChallenges`
 * store method, no handler for it, and nothing registered in `index.ts`.
 *
 * When the callable lands, this provider takes over the query and derives
 * `active` from a `/c/:challengeId` route match rather than from a prop — the
 * URL is what a member can share, so it, not a second store, decides which
 * challenge is open.
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
