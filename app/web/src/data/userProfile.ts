import { createCallable } from '../lib/callable';
import {
  GetUserProfileResponseSchema,
  UserProfileResponseSchema,
} from '../types/schemas';
import type { UserProfile } from '../types';

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
