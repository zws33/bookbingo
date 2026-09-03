import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { Reading } from '@bookbingo/lib-types';
import { subscribeToAllReadings } from '../data/readings';

export function useAllReadings(): {
  readingsByUser: Map<string, Reading[]>;
  loading: boolean;
  error: Error | undefined;
} {
  const [readingsByUser, setReadingsByUser] = useState<Map<string, Reading[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToAllReadings(
      (next) => {
        log.debug('useAllReadings', 'snapshot received', { users: next.size });
        setReadingsByUser(next);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useAllReadings', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { readingsByUser, loading, error };
}
