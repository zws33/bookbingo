import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { User } from 'firebase/auth';
import { subscribeToAuthState } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(
      (nextUser) => {
        log.debug('useAuth', 'state received', {
          uid: nextUser?.uid ?? null,
        });
        setUser(nextUser);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useAuth', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { user, loading, error };
}
