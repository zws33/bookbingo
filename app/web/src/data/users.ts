import {
  collection,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';

export interface UsersRepository {
  subscribeToUsers(
    onData: (users: UserProfile[]) => void,
    onError: (error: Error) => void,
  ): () => void;
}

/**
 * Live subscription to the shared /users collection. Pushes the full list on
 * every change and returns an unsubscribe function. Primary path for UI hooks.
 */
export function subscribeToUsers(
  onData: (users: UserProfile[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => onData(snap.docs.map(toUserProfile)),
    onError,
  );
}

/**
 * Maps a user document to the profile shape the UI renders. Shared with
 * data/userProfile.ts, which reads the same documents one at a time — hence
 * the DocumentSnapshot parameter rather than QueryDocumentSnapshot.
 *
 * Google sign-in supplies name and photoURL, but a profile written before
 * enrichment (or by a test fixture) can be missing either.
 */
export function toUserProfile(doc: DocumentSnapshot): UserProfile {
  const data = doc.data() ?? {};
  return {
    id: doc.id, // ID is the key, not a stored field
    name: data.name ?? 'User',
    ...(data.photoURL != null && { photoURL: data.photoURL }),
  };
}
