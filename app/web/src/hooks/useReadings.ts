import { useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Reading } from '../types';

export function useReadings(userId: string) {
  const query = userId
    ? collection(db, 'users', userId, 'readings')
    : undefined;
  const [snapshot, loading, error] = useCollection(query);

  const readings: Reading[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Reading[];
  }, [snapshot]);

  return { readings, loading, error };
}
