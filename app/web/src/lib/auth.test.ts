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

    expect(onAuthStateChanged).toHaveBeenCalledWith(
      auth,
      expect.any(Function),
      onError,
    );
    expect(result).toBe(unsubscribe);
  });

  it('forwards a null user straight through to onData', () => {
    const onData = vi.fn();
    const onError = vi.fn();
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      (callback as (user: User | null) => void)(null);
      return vi.fn();
    });

    subscribeToAuthState(onData, onError);

    expect(onData).toHaveBeenCalledWith(null);
    expect(onError).not.toHaveBeenCalled();
  });

  it('narrows a valid Firebase user to AuthUser before calling onData', () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const user = {
      uid: 'user-1',
      displayName: 'Ada',
      photoURL: null,
    } as User;
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      (callback as (user: User | null) => void)(user);
      return vi.fn();
    });

    subscribeToAuthState(onData, onError);

    expect(onData).toHaveBeenCalledWith({
      uid: 'user-1',
      displayName: 'Ada',
      photoURL: null,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('routes a user missing uid to onError instead of onData', () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const invalidUser = { displayName: 'Ada', photoURL: null } as User;
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, callback) => {
      (callback as (user: User | null) => void)(invalidUser);
      return vi.fn();
    });

    subscribeToAuthState(onData, onError);

    expect(onData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
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
