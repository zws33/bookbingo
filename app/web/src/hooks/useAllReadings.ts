import { useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collectionGroup } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { log } from '@bookbingo/lib-util';
import { Reading } from '../types';

export function useAllReadings(): {
  readingsByUser: Map<string, Reading[]>;
  loading: boolean;
  error: Error | undefined;
} {
  const [snapshot, loading, error] = useCollection(
    collectionGroup(db, 'readings'),
  );

  useEffect(() => {
    if (error) log.error('useAllReadings', error);
  }, [error]);

  const readingsByUser = useMemo(() => {
    const map = new Map<string, Reading[]>();
    if (!snapshot) return map;

    for (const doc of snapshot.docs) {
      const userId = doc.ref.parent.parent?.id;
      if (!userId) continue;

      const data = doc.data();
      const reading: Reading = {
        ...data,
        // Fallback to empty string for legacy data missing bookId
        bookId: data.bookId || '',
        id: doc.id,
      } as Reading;
      const existing = map.get(userId);
      if (existing) {
        existing.push(reading);
      } else {
        map.set(userId, [reading]);
      }
    }

    return map;
  }, [snapshot]);

  return { readingsByUser, loading, error };
}
