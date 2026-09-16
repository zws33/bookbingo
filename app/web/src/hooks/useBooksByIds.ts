import { useEffect, useMemo, useState } from 'react';
import type { Book } from '@bookbingo/lib-types';
import { getBooksById } from '../data/books.js';

/**
 * Fetches only the books referenced by `bookIds`, keyed by id.
 * Keyed on a sorted/deduped join of the ids rather than the array reference,
 * so passing a freshly-mapped array each render doesn't refire the fetch.
 */
export function useBooksByIds(bookIds: string[]) {
  const [booksById, setBooksById] = useState<Map<string, Book>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const key = useMemo(() => [...new Set(bookIds)].sort().join(','), [bookIds]);

  useEffect(() => {
    const ids = key === '' ? [] : key.split(',');
    let ignore = false;
    setLoading(true);
    getBooksById(ids)
      .then((books) => {
        if (ignore) return;
        setBooksById(new Map(books.map((book) => [book.id, book])));
        setError(undefined);
      })
      .catch((err: Error) => {
        if (!ignore) setError(err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [key]);

  return { booksById, loading, error };
}
