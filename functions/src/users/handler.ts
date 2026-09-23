import type { CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, reportWriteFailure } from '../observability.js';
import type { UserProfileRepository } from './store.js';
import { GetUserProfileRequestSchema } from './schema.js';
import type { UserProfile } from '@bookbingo/lib-types';

export function userHandlers(usersRepo: UserProfileRepository) {
  return {
    async list(request: CallableRequest<unknown>): Promise<UserProfile[]> {
      requireAuth(request, 'load users');
      return usersRepo.list();
    },

    /**
     * One profile, or null.
     *
     * A missing document is not an error: the leaderboard links to any user id
     * that appears in the readings, including one whose profile was never
     * written.
     */
    async get(request: CallableRequest<unknown>): Promise<UserProfile | null> {
      requireAuth(request, 'load a profile');
      const { userId } = parseRequest(
        GetUserProfileRequestSchema,
        request.data,
      );
      return usersRepo.get(userId);
    },

    /**
     * Writes the caller's profile from their ID token.
     *
     * Name and photo come from the verified token rather than the request body,
     * so a caller cannot write someone else's name onto their own profile or
     * post an arbitrary image URL — the client used to send both fields itself.
     *
     * `picture` is a declared claim typed `string | undefined`. `name` is not:
     * it reaches us through DecodedIdToken's index signature as `any`, so the
     * typeof check is what makes it a string rather than whatever the provider
     * sent.
     */
    async sync(request: CallableRequest<unknown>): Promise<UserProfile> {
      const { uid, token } = requireAuth(request, 'save your profile');
      const claimedName: unknown = token.name;
      const name = typeof claimedName === 'string' ? claimedName.trim() : '';
      const photoURL = token.picture ?? null;

      const profile: UserProfile = {
        id: uid,
        name: name === '' ? 'User' : name,
        photoURL,
      };

      try {
        await usersRepo.upsert(profile);
      } catch (error) {
        reportWriteFailure(error, 'user.sync', { uid });
      }

      logEvent('user.sync', {
        uid,
        outcome: 'ok',
        hasName: name !== '',
        hasPhoto: photoURL !== null,
      });
      return profile;
    },
  };
}
