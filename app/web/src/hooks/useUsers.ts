import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import { subscribeToUsers } from '../data/users';
import type { UserProfile } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToUsers(
      (next) => {
        log.debug('useUsers', 'snapshot received', { count: next.length });
        setUsers(next);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useUsers', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { users, loading, error };
}
