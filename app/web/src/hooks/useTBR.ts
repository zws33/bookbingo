import { useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { log } from '@bookbingo/lib-util';
import type { TBREntry } from '@bookbingo/lib-types';

export function useTBR(userId: string) {
  const query = userId ? collection(db, 'users', userId, 'tbr') : undefined;
  const [snapshot, loading, error] = useCollection(query);

  useEffect(() => {
    if (error) log.error('useTBR', error);
  }, [error]);

  const entries: TBREntry[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as TBREntry);
  }, [snapshot]);

  return { entries, loading, error };
}
