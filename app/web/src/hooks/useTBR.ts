import { useEffect, useState } from 'react';
import { log } from '@bookbingo/lib-util';
import type { TBREntry } from '@bookbingo/lib-types';
import { subscribeToTbrEntries } from 'src/data/tbr';

export function useTBR(userId: string) {
  const [tbrEntries, setTbrEntries] = useState<TBREntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToTbrEntries(
      userId,
      (entries) => {
        setLoading(false);
        setTbrEntries(entries);
      },
      (err) => {
        log.error('useTBR', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    if (error) log.error('useTBR', error);
  }, [error]);

  return { tbrEntries, loading, error };
}
