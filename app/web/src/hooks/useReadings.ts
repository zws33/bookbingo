import { useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { log } from '@bookbingo/lib-util';
import { Reading } from '../types';

export function useReadings(userId: string) {
  const path = userId ? `users/${userId}/readings` : null;
  const query = userId
    ? collection(db, 'users', userId, 'readings')
    : undefined;
  const [snapshot, loading, error] = useCollection(query);

  useEffect(() => {
    log.debug('useReadings', 'query', { path, loading, error: error?.message ?? null });
  }, [path, loading, error]);

  useEffect(() => {
    if (snapshot) {
      log.debug('useReadings', 'snapshot received', { count: snapshot.docs.length });
    }
  }, [snapshot]);

  const readings: Reading[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        // Fallback to empty string for legacy data missing bookId
        bookId: data.bookId || '',
        ...data,
      } as Reading;
    });
  }, [snapshot]);

  return { readings, loading, error };
}
