import { useQuery } from '@tanstack/react-query';
import { getScore } from 'src/data/score';
import { queryKeys } from 'src/lib/queryClient';
import type { Score } from 'src/types/schemas';

const NO_SCORE: Score = {
  score: 0,
  varietyPoints: 0,
  volumePoints: 0,
  tileCounts: {},
  totalBooks: 0,
};

export function useScore(challengeId: string, userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.score(challengeId, userId),
    queryFn: () => getScore({ challengeId, userId }),
    enabled: challengeId !== '' && userId !== '',
  });

  const idle = challengeId === '' || userId === '';

  return {
    score: data ?? NO_SCORE,
    loading: idle ? false : isPending,
    error: error ?? undefined,
  };
}
