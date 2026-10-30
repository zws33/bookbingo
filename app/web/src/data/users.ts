import type { UserProfile } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import {
  GetLeaderboardResponseSchema,
  ListUsersResponseSchema,
  type LeaderboardRow,
} from '../types/schemas';

export const listUsers = createCallable<void, UserProfile[]>(
  'listUsersV2',
  ListUsersResponseSchema,
);

/**
 * Every active member of the challenge with their score, highest first. The
 * server owns the scoring.
 */
export const getLeaderboard = createCallable<
  { challengeId: string },
  LeaderboardRow[]
>('getLeaderboardV2', GetLeaderboardResponseSchema);
