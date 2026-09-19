import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys, in one place so a mutation's invalidation cannot drift from the
 * query it is meant to refresh. Keys are compared structurally, so the ids a
 * caller passes are sorted and deduped here rather than at each call site.
 */
export const queryKeys = {
  boardConfig: ['boardConfig'] as const,
  books: (ids: string[]) => ['books', [...new Set(ids)].sort()] as const,
  users: ['users'] as const,
  userProfile: (userId: string) => ['userProfile', userId] as const,
  leaderboard: ['leaderboard'] as const,
  readings: (userId: string) => ['readings', userId] as const,
  library: ['library'] as const,
  tbr: (userId: string) => ['tbr', userId] as const,
};

/**
 * Replaces the Firestore snapshot listeners, which pushed every change as it
 * happened. Nothing streams now, so freshness comes from refetching: on mount
 * when the data is stale, on window focus, and whenever a mutation invalidates
 * a key.
 *
 * `staleTime` is the trade: at 0 every page navigation refetches through a
 * callable that may cold-start, for data that changes a few times a week. 30
 * seconds keeps navigation instant and still refreshes a tab left open.
 *
 * One retry, because a cold start can fail once while the container boots;
 * more than that only delays the error the user needs to see.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
