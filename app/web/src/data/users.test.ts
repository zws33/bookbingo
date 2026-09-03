import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent real Firebase SDK initialization; subscribeToUsers only passes
// `db` through to collection(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so onSnapshot returns whatever snapshot each test
// supplies instead of validating its args against a real Firestore instance.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  onSnapshot: vi.fn(),
}));

import { collection, onSnapshot } from 'firebase/firestore';
import { subscribeToUsers, toUserProfile } from './users';

const mockOnSnapshot = vi.mocked(onSnapshot);

/** Build a QuerySnapshot-like object from (id, data) pairs. */
function makeSnapshot(docs: { id: string; data: Record<string, unknown> }[]) {
  return {
    docs: docs.map(({ id, data }) => ({ id, data: () => data })),
  };
}

/** Minimal DocumentSnapshot stand-in: only id and data() are used. */
function makeDoc(id: string, data: Record<string, unknown> | undefined) {
  return { id, data: () => data } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscribeToUsers', () => {
  it('queries the shared users collection and returns the unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToUsers(vi.fn(), vi.fn());

    expect(collection).toHaveBeenCalledWith({}, 'users');
    expect(mockOnSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(unsubscribe);
  });

  it('maps each pushed snapshot to UserProfile[] via onData', () => {
    let pushSnapshot: (snap: unknown) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      onNext: (snap: unknown) => void,
    ) => {
      pushSnapshot = onNext;
      return vi.fn();
    }) as never);

    const onData = vi.fn();
    subscribeToUsers(onData, vi.fn());

    pushSnapshot(
      makeSnapshot([
        {
          id: 'user-1',
          data: { name: 'Ada', photoURL: 'https://example.test/ada.png' },
        },
        { id: 'user-2', data: { name: 'Grace' } },
      ]),
    );

    expect(onData).toHaveBeenCalledWith([
      { id: 'user-1', name: 'Ada', photoURL: 'https://example.test/ada.png' },
      { id: 'user-2', name: 'Grace' },
    ]);
  });

  it('forwards listener errors to onError', () => {
    let raise: (error: Error) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _query: unknown,
      _onNext: unknown,
      onError: (error: Error) => void,
    ) => {
      raise = onError;
      return vi.fn();
    }) as never);

    const onError = vi.fn();
    subscribeToUsers(vi.fn(), onError);

    const error = new Error('permission-denied');
    raise(error);

    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('toUserProfile', () => {
  it('falls back to "User" when the profile has no name', () => {
    expect(toUserProfile(makeDoc('user-1', {}))).toEqual({
      id: 'user-1',
      name: 'User',
    });
  });

  it('omits photoURL rather than emitting an undefined key', () => {
    const profile = toUserProfile(makeDoc('user-1', { name: 'Ada' }));
    expect('photoURL' in profile).toBe(false);
  });

  it('tolerates a snapshot whose data() is undefined', () => {
    expect(toUserProfile(makeDoc('user-1', undefined))).toEqual({
      id: 'user-1',
      name: 'User',
    });
  });
});
