import { useQuery } from '@tanstack/react-query';
import { listMyTBR } from '../data/tbr';
import { queryKeys } from '../lib/queryClient';
import type { TBREntry } from '../types/schemas';

const NO_ENTRIES: TBREntry[] = [];

/**
 * The signed-in user's reading list for a challenge.
 *
 * Takes the user id only to key the cache and decide whether to run: the list
 * the server returns is always the caller's own.
 */
export function useTBR(challengeId: string, userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.tbr(challengeId, userId),
    queryFn: () => listMyTBR({ challengeId }),
    enabled: challengeId !== '' && userId !== '',
  });

  const idle = challengeId === '' || userId === '';

  return {
    entries: data ?? NO_ENTRIES,
    loading: idle ? false : isPending,
    error: error ?? undefined,
  };
}
