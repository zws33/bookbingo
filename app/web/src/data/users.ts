import type { UserProfile } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import {
  GetLeaderboardResponseSchema,
  ListUsersResponseSchema,
  type LeaderboardRow,
} from '../types/schemas';

export const listUsers = createCallable<void, UserProfile[]>(
  'listUsers',
  ListUsersResponseSchema,
);

/**
 * Every user with their score, highest first.
 *
 * One call replaces the client's join of the users collection with every
 * user's readings, and the scoring that followed it.
 */
export const getLeaderboard = createCallable<void, LeaderboardRow[]>(
  'getLeaderboard',
  GetLeaderboardResponseSchema,
);
