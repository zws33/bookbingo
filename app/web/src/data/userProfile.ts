import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toUserProfile } from './users';
import type { UserProfile } from '../types';

export interface UserProfileRepository {
  subscribeToUserProfile(
    userId: string,
    onData: (profile: UserProfile | undefined) => void,
    onError: (error: Error) => void,
  ): () => void;
}

/**
 * Live subscription to a single /users/{id} document. Pushes the mapped
 * profile on every change and returns an unsubscribe function.
 *
 * A user id that has no document is a normal outcome, not an error — the
 * leaderboard links to any id that appears in the readings collection group,
 * including one whose profile was never written. Those pushes carry undefined.
 */
export function subscribeToUserProfile(
  userId: string,
  onData: (profile: UserProfile | undefined) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', userId),
    (snap: DocumentSnapshot) =>
      onData(snap.exists() ? toUserProfile(snap) : undefined),
    onError,
  );
}
