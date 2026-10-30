import { useQuery } from '@tanstack/react-query';
import { getLibrary } from '../data/library';
import { queryKeys } from '../lib/queryClient';
import type { LibraryBook } from '../types/schemas';

const NO_BOOKS: LibraryBook[] = [];

/** Books with their readers, already grouped and sorted by the server. */
export function useLibrary(challengeId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.library(challengeId),
    queryFn: () => getLibrary({ challengeId }),
    enabled: challengeId !== '',
  });

  return {
    books: data ?? NO_BOOKS,
    loading: challengeId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
