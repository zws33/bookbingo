import { useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { log } from '@bookbingo/lib-util';
import { Book } from '../types';

/**
 * Hook to fetch all shared books from the /books/ collection.
 * Returns a Map keyed by book ID for O(1) lookups when joining with readings.
 */
export function useBooks() {
  const queryRef = useMemo(() => collection(db, 'books'), []);
  const [snapshot, loading, error] = useCollection(queryRef);

  useEffect(() => {
    log.debug('useBooks', 'query', { loading, error: error?.message ?? null });
  }, [loading, error]);

  useEffect(() => {
    if (snapshot) {
      log.debug('useBooks', 'snapshot received', { count: snapshot.docs.length });
    }
  }, [snapshot]);

  const booksById = useMemo(() => {
    const map = new Map<string, Book>();
    if (!snapshot) return map;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      map.set(doc.id, {
        id: doc.id,
        ...data,
      } as Book);
    });

    return map;
  }, [snapshot]);

  return { booksById, loading, error };
}
