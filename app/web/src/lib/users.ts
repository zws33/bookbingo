import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';

export async function saveUserProfile(user: User): Promise<void> {
  await setDoc(
    doc(db, 'users', user.uid),
    {
      name: user.displayName ?? 'User',
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
