import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure } from '../observability.js';
import { getUserProfile, listUserProfiles } from './store.js';
import { GetUserProfileRequestSchema } from './schema.js';
import type { UserProfile } from '@bookbingo/lib-types';

export async function listUsersHandler(
  request: CallableRequest<unknown>,
): Promise<UserProfile[]> {
  requireAuth(request, 'load users');
  return listUserProfiles();
}

/**
 * One profile, or null.
 *
 * A missing document is not an error: the leaderboard links to any user id that
 * appears in the readings, including one whose profile was never written.
 */
export async function getUserProfileHandler(
  request: CallableRequest<unknown>,
): Promise<UserProfile | null> {
  requireAuth(request, 'load a profile');
  const { userId } = parseRequest(GetUserProfileRequestSchema, request.data);
  return getUserProfile(userId);
}

/**
 * Writes the caller's profile from their ID token.
 *
 * Name and photo come from the verified token rather than the request body, so
 * a caller cannot write someone else's name onto their own profile or post an
 * arbitrary image URL — the client used to send both fields itself.
 *
 * `picture` is a declared claim typed `string | undefined`. `name` is not: it
 * reaches us through DecodedIdToken's index signature as `any`, so the typeof
 * check is what makes it a string rather than whatever the provider sent.
 */
export async function syncMyProfileHandler(
  request: CallableRequest<unknown>,
): Promise<UserProfile> {
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
    await db.collection('users').doc(uid).set(
      {
        name: profile.name,
        photoURL: profile.photoURL,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    logFailure('user.sync', error, { uid, outcome: 'error' });
    throw new HttpsError('internal', 'Failed to save your profile.');
  }

  logEvent('user.sync', {
    uid,
    outcome: 'ok',
    hasName: name !== '',
    hasPhoto: photoURL !== null,
  });
  return profile;
}
