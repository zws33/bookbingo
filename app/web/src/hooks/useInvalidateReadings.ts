import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../lib/queryClient';

/**
 * A reading write is only visible after the affected queries refetch, and a
 * reading feeds three: the user's list, the leaderboard's scores, and the
 * library's read counts. Promote also empties the TBR list. Callers await this
 * so the UI they return to is current.
 */
export function useInvalidateReadings(userId: string) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.readings(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard }),
      queryClient.invalidateQueries({ queryKey: queryKeys.library }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tbr(userId) }),
    ]);
  }, [queryClient, userId]);
}
