import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { Book } from '@bookbingo/lib-types';
import { subscribeToBooks } from '../data/books';

/**
 * Hook to fetch all shared books from the /books/ collection.
 * Returns a Map keyed by book ID for O(1) lookups when joining with readings.
 */
export function useBooks() {
  const [booksById, setBooksById] = useState<Map<string, Book>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToBooks(
      (books) => {
        log.debug('useBooks', 'snapshot received', { count: books.length });
        setBooksById(new Map(books.map((book) => [book.id, book])));
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useBooks', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { booksById, loading, error };
}
