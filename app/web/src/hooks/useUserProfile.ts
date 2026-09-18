import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '../data/userProfile';
import { queryKeys } from '../lib/queryClient';

/**
 * One user's profile.
 *
 * `profile` is undefined both while loading and when the user has no profile
 * document, so callers must check `loading` first — the same contract the
 * subscription-based hook had.
 */
export function useUserProfile(userId: string) {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.userProfile(userId),
    queryFn: () => getUserProfile({ userId }),
    enabled: userId !== '',
  });

  return {
    profile: data ?? undefined,
    loading: userId === '' ? false : isPending,
    error: error ?? undefined,
  };
}
