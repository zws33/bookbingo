import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent real Firebase SDK initialization; subscribeToUserProfile only passes
// `db` through to doc(), which we mock below.
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so onSnapshot returns whatever snapshot each test
// supplies instead of validating its args against a real Firestore instance.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  onSnapshot: vi.fn(),
}));

import { doc, onSnapshot } from 'firebase/firestore';
import { subscribeToUserProfile } from './userProfile';

const mockOnSnapshot = vi.mocked(onSnapshot);

/** Build a DocumentSnapshot-like object; data() is undefined when absent. */
function makeSnapshot(id: string, data?: Record<string, unknown>) {
  return { id, exists: () => data !== undefined, data: () => data };
}

/** Registers the onNext callback and hands back a pusher for it. */
function captureNext() {
  let push: (snap: unknown) => void = () => {};
  mockOnSnapshot.mockImplementation(((
    _ref: unknown,
    onNext: (snap: unknown) => void,
  ) => {
    push = onNext;
    return vi.fn();
  }) as never);
  return (snap: unknown) => push(snap);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('subscribeToUserProfile', () => {
  it('reads the user document and returns the unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe as never);

    const result = subscribeToUserProfile('user-42', vi.fn(), vi.fn());

    expect(doc).toHaveBeenCalledWith({}, 'users', 'user-42');
    expect(mockOnSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(unsubscribe);
  });

  it('maps an existing document to a UserProfile', () => {
    const push = captureNext();
    const onData = vi.fn();
    subscribeToUserProfile('user-1', onData, vi.fn());

    push(
      makeSnapshot('user-1', {
        name: 'Ada',
        photoURL: 'https://example.test/ada.png',
      }),
    );

    expect(onData).toHaveBeenCalledWith({
      id: 'user-1',
      name: 'Ada',
      photoURL: 'https://example.test/ada.png',
    });
  });

  it('pushes undefined for a document that does not exist', () => {
    const push = captureNext();
    const onData = vi.fn();
    subscribeToUserProfile('ghost', onData, vi.fn());

    push(makeSnapshot('ghost'));

    expect(onData).toHaveBeenCalledWith(undefined);
  });

  it('falls back to "User" when the profile has no name', () => {
    const push = captureNext();
    const onData = vi.fn();
    subscribeToUserProfile('user-1', onData, vi.fn());

    push(makeSnapshot('user-1', {}));

    expect(onData).toHaveBeenCalledWith({ id: 'user-1', name: 'User' });
  });

  it('forwards listener errors to onError', () => {
    let raise: (error: Error) => void = () => {};
    mockOnSnapshot.mockImplementation(((
      _ref: unknown,
      _onNext: unknown,
      onError: (error: Error) => void,
    ) => {
      raise = onError;
      return vi.fn();
    }) as never);

    const onError = vi.fn();
    subscribeToUserProfile('user-1', vi.fn(), onError);

    const error = new Error('permission-denied');
    raise(error);

    expect(onError).toHaveBeenCalledWith(error);
  });
});
