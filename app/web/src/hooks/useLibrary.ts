import { useQuery } from '@tanstack/react-query';
import { getLibrary } from '../data/library';
import { queryKeys } from '../lib/queryClient';
import type { LibraryBook } from '../types/schemas';

const NO_BOOKS: LibraryBook[] = [];

/** Books with their readers, already grouped and sorted by the server. */
export function useLibrary() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.library,
    queryFn: () => getLibrary(),
  });

  return {
    books: data ?? NO_BOOKS,
    loading: isPending,
    error: error ?? undefined,
  };
}
