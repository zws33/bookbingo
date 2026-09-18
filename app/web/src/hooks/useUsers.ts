import { useQuery } from '@tanstack/react-query';
import { listUsers } from '../data/users';
import { queryKeys } from '../lib/queryClient';
import type { UserProfile } from '../types';

const NO_USERS: UserProfile[] = [];

export function useUsers() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => listUsers(),
  });

  return {
    users: data ?? NO_USERS,
    loading: isPending,
    error: error ?? undefined,
  };
}
