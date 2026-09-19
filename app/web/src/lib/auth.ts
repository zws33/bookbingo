import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import z from 'zod/v4';
import { auth } from './firebase';

/**
 * The fields we take from a Firebase Auth user. Lives here rather than with
 * the API response schemas: this is the shape the SDK hands us, not something
 * a callable returns.
 */
const AuthUserSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().nullable(),
  photoURL: z.string().nullable(),
});

const googleProvider = new GoogleAuthProvider();

export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

export function subscribeToAuthState(
  onData: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(
    auth,
    (user) => {
      if (user === null) {
        onData(null);
        return;
      }
      const parsed = AuthUserSchema.safeParse(user);
      if (!parsed.success) {
        onError(
          new Error(`Invalid auth user: ${z.prettifyError(parsed.error)}`),
        );
        return;
      }
      onData(parsed.data);
    },
    onError,
  );
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
