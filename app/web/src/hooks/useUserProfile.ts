import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import { subscribeToUserProfile } from '../data/userProfile';
import type { UserProfile } from '../types';

export function useUserProfile(userId: string) {
  const [profile, setProfile] = useState<UserProfile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!userId) {
      setProfile(undefined);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToUserProfile(
      userId,
      (next) => {
        // undefined here means the document does not exist, which reads the
        // same as "not loaded yet". Callers must check loading first.
        setProfile(next);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useUserProfile', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  return { profile, loading, error };
}
