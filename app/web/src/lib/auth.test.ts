import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

const { googleProvider } = vi.hoisted(() => ({
  googleProvider: { providerId: 'google.com' },
}));

vi.mock('./firebase', () => ({ auth: { app: 'test-auth' } }));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(function MockGoogleAuthProvider() {
    return googleProvider;
  }),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

import { auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { signInWithGoogle, signOutUser, subscribeToAuthState } from './auth';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth service', () => {
  it('subscribes to Firebase auth state and returns the unsubscribe', () => {
    const unsubscribe = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    vi.mocked(onAuthStateChanged).mockReturnValue(unsubscribe);

    const result = subscribeToAuthState(onData, onError);

    expect(onAuthStateChanged).toHaveBeenCalledWith(auth, onData, onError);
    expect(result).toBe(unsubscribe);
  });

  it('signs in with the shared Google provider and returns the user', async () => {
    const user = { uid: 'user-1', displayName: 'Ada' } as User;
    vi.mocked(signInWithPopup).mockResolvedValue({ user } as never);

    await expect(signInWithGoogle()).resolves.toBe(user);

    expect(signInWithPopup).toHaveBeenCalledWith(auth, googleProvider);
  });

  it('signs out through Firebase auth', async () => {
    vi.mocked(signOut).mockResolvedValue();

    await signOutUser();

    expect(signOut).toHaveBeenCalledWith(auth);
  });
});
