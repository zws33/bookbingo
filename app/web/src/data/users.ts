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

/** Every user with their score, highest first. The server owns the scoring. */
export const getLeaderboard = createCallable<void, LeaderboardRow[]>(
  'getLeaderboard',
  GetLeaderboardResponseSchema,
);
