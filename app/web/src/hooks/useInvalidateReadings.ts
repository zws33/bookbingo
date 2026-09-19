import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../lib/queryClient';

/**
 * Refreshes everything a reading write changes.
 *
 * Firestore listeners used to push these updates on their own. Now a write is
 * only visible after the affected queries refetch, and a reading feeds three
 * of them: the user's own list, the leaderboard's scores, and the library's
 * read counts. Promoting a planned entry also empties it from the TBR list, so
 * that goes too. Callers await this so the UI they return to is current.
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
