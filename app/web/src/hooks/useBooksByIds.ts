import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Book } from '@bookbingo/lib-types';
import { getBooksById } from '../data/books';
import { queryKeys } from '../lib/queryClient';

const NO_BOOKS: Book[] = [];

/**
 * Fetches only the books referenced by `bookIds`, keyed by id.
 *
 * The query key sorts and dedupes the ids, so passing a freshly-mapped array
 * each render hits the same cache entry instead of refetching, and two views
 * asking for the same books share one request.
 */
export function useBooksByIds(bookIds: string[]) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.books(bookIds),
    queryFn: () => getBooksById(bookIds),
  });

  const booksById = useMemo(
    () => new Map((data ?? NO_BOOKS).map((book) => [book.id, book])),
    [data],
  );

  return { booksById, loading: isPending, error: error ?? undefined };
}
