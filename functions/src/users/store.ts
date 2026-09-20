import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { UserProfileDocSchema, mapValid } from '../schemas.js';

export interface UserProfile {
  id: string;
  name: string;
  photoURL: string | null;
}

/**
 * The profile shape the UI renders.
 *
 * `photoURL` is `null` rather than absent: the client's optional-property form
 * does not survive JSON, where an omitted key and an explicit null read the
 * same. Google sign-in supplies both fields, but a profile written before
 * enrichment (or by a test fixture) can be missing either.
 */
export function toUserProfile(doc: DocumentSnapshot): UserProfile {
  const data = UserProfileDocSchema.parse(doc.data() ?? {});
  return {
    id: doc.id, // ID is the key, not a stored field
    name: data.name,
    photoURL: data.photoURL ?? null,
  };
}

export async function listUserProfiles(): Promise<UserProfile[]> {
  const snapshot = await db.collection('users').get();
  return mapValid('users', snapshot.docs, toUserProfile);
}

/** `null` when the id has no document, which is normal — see getUserProfileHandler. */
export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const snapshot = await db.collection('users').doc(userId).get();
  return snapshot.exists ? toUserProfile(snapshot) : null;
}
