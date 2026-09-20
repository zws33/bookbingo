import { useQuery } from '@tanstack/react-query';
import { listMyTBR } from '../data/tbr';
import { queryKeys } from '../lib/queryClient';
import type { TBREntry } from '../types/schemas';

const NO_ENTRIES: TBREntry[] = [];

/**
 * The signed-in user's reading list.
 *
 * Takes the id only to decide whether to run: the list the server returns is
 * always the caller's own.
 */
export function useTBR(userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.tbr(userId),
    queryFn: () => listMyTBR(),
    enabled: userId !== '',
  });

  return {
    entries: data ?? NO_ENTRIES,
    loading: userId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
