import { useQuery } from '@tanstack/react-query';
import { listReadings } from '../data/readings';
import { queryKeys } from '../lib/queryClient';
import type { Reading, Score } from '../types/schemas';

const NO_READINGS: Reading[] = [];

const NO_SCORE: Score = {
  score: 0,
  varietyPoints: 0,
  volumePoints: 0,
  balanceFactor: 1,
  tileCounts: {},
  totalBooks: 0,
};

/**
 * One user's readings and their score.
 *
 * `score` is whatever the server computed for this exact set of readings, so
 * callers render it rather than recomputing.
 *
 * `challengeId` only partitions the cache for now — `listReadings` still takes
 * the user alone. It is in the signature so the call sites are already right
 * when the callable becomes challenge-scoped.
 */
export function useReadings(challengeId: string, userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.readings(challengeId, userId),
    queryFn: () => listReadings({ userId }),
    enabled: userId !== '',
  });

  return {
    readings: data?.readings ?? NO_READINGS,
    score: data?.score ?? NO_SCORE,
    loading: userId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
