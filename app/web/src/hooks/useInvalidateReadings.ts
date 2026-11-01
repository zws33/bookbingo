import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../lib/queryClient';

/**
 * Invalidates every query derived from reading state: a reading write does not
 * refetch them on its own. Callers await this so a navigation that follows the
 * write lands on current data.
 */
export function useInvalidateReadings(challengeId: string, userId: string) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.readings(challengeId, userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.leaderboard(challengeId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.library(challengeId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tbr(challengeId, userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.score(challengeId, userId),
      }),
    ]);
  }, [queryClient, challengeId, userId]);
}
