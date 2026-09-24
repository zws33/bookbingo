import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { mapValid } from '../common/firestoreHelpers.js';
import { UserProfileDocSchema } from './schema.js';
import type { UserProfile } from '@bookbingo/lib-types';

export interface UserProfileRepository {
  list(): Promise<UserProfile[]>;
  /** `null` when the id has no document, which is normal — see getUserProfileHandler. */
  get(userId: string): Promise<UserProfile | null>;
  upsert(profile: UserProfile): Promise<void>;
}

/**
 * `photoURL` is `null` rather than absent: the client's optional-property form
 * does not survive JSON, where an omitted key and an explicit null read the
 * same. Google sign-in supplies both fields, but a profile written before
 * enrichment (or by a test fixture) can be missing either.
 */
export function toUserProfile(doc: DocumentSnapshot): UserProfile {
  const data = UserProfileDocSchema.parse(doc.data() ?? {});
  return {
    id: doc.id,
    name: data.name,
    photoURL: data.photoURL ?? null,
  };
}

const firestoreUserProfiles: UserProfileRepository = {
  async list() {
    const snapshot = await db.collection('users').get();
    return mapValid('users', snapshot.docs, toUserProfile);
  },

  async get(userId) {
    const snapshot = await db.collection('users').doc(userId).get();
    return snapshot.exists ? toUserProfile(snapshot) : null;
  },

  async upsert({ id, name, photoURL }) {
    await db
      .collection('users')
      .doc(id)
      .set(
        { name, photoURL, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  },
};

export function userProfileRepository(): UserProfileRepository {
  return firestoreUserProfiles;
}
