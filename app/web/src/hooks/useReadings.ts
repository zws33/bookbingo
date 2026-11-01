import { useQuery } from '@tanstack/react-query';
import { listReadings } from '../data/readings';
import { queryKeys } from '../lib/queryClient';
import type { Reading } from '../types/schemas';

const NO_READINGS: Reading[] = [];

/** One member's readings in a challenge. The score comes from `useScore`. */
export function useReadings(challengeId: string, userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.readings(challengeId, userId),
    queryFn: () => listReadings({ challengeId, userId }),
    enabled: challengeId !== '' && userId !== '',
  });

  const idle = challengeId === '' || userId === '';

  return {
    readings: data?.readings ?? NO_READINGS,
    loading: idle ? false : isPending,
    error: error ?? undefined,
  };
}
