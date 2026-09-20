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
 */
export function useReadings(userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.readings(userId),
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
