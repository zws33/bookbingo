import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { TBREntry } from '@bookbingo/lib-types';
import { subscribeToTBR } from '../data/tbr';

export function useTBR(userId: string) {
  const [entries, setEntries] = useState<TBREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToTBR(
      userId,
      (next) => {
        log.debug('useTBR', 'snapshot received', { count: next.length });
        setEntries(next);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useTBR', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  return { entries, loading, error };
}
