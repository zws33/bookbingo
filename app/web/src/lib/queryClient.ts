import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys, in one place so a mutation's invalidation cannot drift from the
 * query it is meant to refresh. Keys are compared structurally, so the ids a
 * caller passes are sorted and deduped here rather than at each call site.
 */
export const queryKeys = {
  boardConfig: ['boardConfig'] as const,
  users: ['users'] as const,
  userProfile: (userId: string) => ['userProfile', userId] as const,
  leaderboard: ['leaderboard'] as const,
  readings: (userId: string) => ['readings', userId] as const,
  library: ['library'] as const,
  tbr: (userId: string) => ['tbr', userId] as const,
};

/**
 * Nothing streams, so freshness comes from refetching on mount, on focus, and
 * on invalidation.
 *
 * `staleTime` 30s: at 0 every navigation refetches through a callable that may
 * cold-start, for data that changes a few times a week.
 *
 * One retry covers a cold start failing once; more only delays the error.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
