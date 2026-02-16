import { useMemo } from 'react';
import { useDocument } from 'react-firebase-hooks/firestore';
import { doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export function useUserProfile(userId: string) {
  const docRef = userId ? doc(db, 'users', userId) : undefined;
  const [snapshot, loading, error] = useDocument(docRef);

  const profile: UserProfile | undefined = useMemo(() => {
    if (!snapshot?.exists()) return undefined;
    return {
      id: snapshot.id,
      name: snapshot.data().name ?? 'User',
      photoURL: snapshot.data().photoURL ?? undefined,
    };
  }, [snapshot]);

  return { profile, loading, error };
}
