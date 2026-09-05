import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import { subscribeToAuthState, type AuthUser } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>();
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
