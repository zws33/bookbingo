import { useMemo, type ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyChallenges } from '../data/challenges';
import { queryKeys } from '../lib/queryClient';
import type { ChallengeSummary } from '../types/challenges';
import {
  ChallengeContext,
  type ChallengeContextValue,
} from './ChallengeContext';

const NO_CHALLENGES: ChallengeSummary[] = [];

/**
 * The active challenge is derived from the route, never stored beside it. A
 * second source of truth would let the URL and the header disagree after a
 * back navigation, and the URL is the part a member can share.
 */
export function ChallengeProvider({
  enabled,
  children,
}: {
  /** False while signed out: there is no caller to list memberships for. */
  enabled: boolean;
  children: ReactNode;
}) {
  const match = useMatch({ path: '/c/:challengeId', end: false });
  const routeChallengeId = match?.params.challengeId;

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.myChallenges,
    queryFn: () => getMyChallenges().then((response) => response.challenges),
    enabled,
  });

  const value = useMemo<ChallengeContextValue>(() => {
    const challenges = data ?? NO_CHALLENGES;
    return {
      challenges,
      active: challenges.find(
        (summary) => summary.challenge.id === routeChallengeId,
      ),
      loading: enabled && isPending,
      error: error ?? undefined,
    };
  }, [data, routeChallengeId, enabled, isPending, error]);

  return <ChallengeContext value={value}>{children}</ChallengeContext>;
}
