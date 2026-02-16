import { useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export function useUsers() {
  const [snapshot, loading, error] = useCollection(collection(db, 'users'));

  const users: UserProfile[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name ?? 'User',
      photoURL: doc.data().photoURL ?? undefined,
    }));
  }, [snapshot]);

  return { users, loading, error };
}
