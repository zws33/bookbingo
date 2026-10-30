import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '../data/users';
import { queryKeys } from '../lib/queryClient';
import type { LeaderboardRow } from '../types/schemas';

const NO_ROWS: LeaderboardRow[] = [];

/** Rows arrive already scored and ranked; the client only renders them. */
export function useLeaderboard(challengeId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.leaderboard(challengeId),
    queryFn: () => getLeaderboard({ challengeId }),
    enabled: challengeId !== '',
  });

  return {
    rows: data ?? NO_ROWS,
    loading: challengeId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
