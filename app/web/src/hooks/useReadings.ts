import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { Reading } from '@bookbingo/lib-types';
import { subscribeToReadings } from '../data/readings';

export function useReadings(userId: string) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!userId) {
      setReadings([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToReadings(
      userId,
      (next) => {
        log.debug('useReadings', 'snapshot received', { count: next.length });
        setReadings(next);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        log.error('useReadings', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  return { readings, loading, error };
}
