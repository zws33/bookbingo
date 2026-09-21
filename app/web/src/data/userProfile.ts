import type { UserProfile } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import {
  GetUserProfileResponseSchema,
  UserProfileResponseSchema,
} from '../types/schemas';

/** null when the id has no profile document — normal, not an error. */
export const getUserProfile = createCallable<
  { userId: string },
  UserProfile | null
>('getUserProfile', GetUserProfileResponseSchema);

/**
 * Writes the signed-in user's profile.
 *
 * Takes no argument: the server reads the name and photo from the ID token, so
 * the client cannot claim someone else's.
 */
export const syncMyProfile = createCallable<void, UserProfile>(
  'syncMyProfile',
  UserProfileResponseSchema,
);
