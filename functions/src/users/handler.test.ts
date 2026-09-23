import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  getUserProfileHandler,
  listUsersHandler,
  syncMyProfileHandler,
} from './handler.js';
import { toUserProfile, type UserProfileRepository } from './store.js';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

/** Every method rejects unless the test overrides it, so an unexpected call fails loudly. */
function fakeRepo(
  overrides: Partial<UserProfileRepository>,
): UserProfileRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
  return {
    list: unexpected('list'),
    get: unexpected('get'),
    upsert: unexpected('upsert'),
    ...overrides,
  };
}

function makeRequest(
  auth: typeof AUTH | undefined,
  data: unknown,
): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

function makeDoc(id: string, data: unknown): DocumentSnapshot {
  return { id, data: () => data } as unknown as DocumentSnapshot;
}

describe('listUsersHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(listUsersHandler(makeRequest(undefined, {})), {
      code: 'unauthenticated',
    });
  });
});

describe('getUserProfileHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      getUserProfileHandler(makeRequest(undefined, { userId: 'user-2' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when userId is missing', async () => {
    await assert.rejects(getUserProfileHandler(makeRequest(AUTH, {})), {
      code: 'invalid-argument',
    });
  });

  test('throws invalid-argument for a whitespace-only userId', async () => {
    await assert.rejects(
      getUserProfileHandler(makeRequest(AUTH, { userId: '   ' })),
      { code: 'invalid-argument' },
    );
  });
});

describe('toUserProfile', () => {
  test('carries the document id as the profile id', () => {
    const profile = toUserProfile(makeDoc('user-1', { name: 'Ada' }));
    assert.deepEqual(profile, { id: 'user-1', name: 'Ada', photoURL: null });
  });

  test('falls back to User when the name is missing', () => {
    assert.equal(toUserProfile(makeDoc('user-1', {})).name, 'User');
  });

  // photoURL is null rather than absent so it survives JSON to the client.
  test('normalizes an absent photoURL to null', () => {
    assert.equal(
      toUserProfile(makeDoc('user-1', { name: 'Ada' })).photoURL,
      null,
    );
  });

  test('keeps a stored photoURL', () => {
    const profile = toUserProfile(
      makeDoc('user-1', { name: 'Ada', photoURL: 'https://example.com/a.png' }),
    );
    assert.equal(profile.photoURL, 'https://example.com/a.png');
  });
});

describe('syncMyProfileHandler with a fake repository', () => {
  const authWith = (token: Record<string, unknown>) => ({
    ...AUTH,
    token,
  });

  test('writes name and photo taken from the verified token', async () => {
    const writes: unknown[] = [];
    const profile = await syncMyProfileHandler(
      makeRequest(authWith({ name: '  Ada  ', picture: 'https://p/a.png' }), {
        name: 'Attacker',
      }),
      fakeRepo({
        upsert: (written) => {
          writes.push(written);
          return Promise.resolve();
        },
      }),
    );
    assert.deepEqual(profile, {
      id: 'user-1',
      name: 'Ada',
      photoURL: 'https://p/a.png',
    });
    assert.deepEqual(writes, [profile]);
  });

  test('falls back to User when the token carries no usable name', async () => {
    const profile = await syncMyProfileHandler(
      makeRequest(authWith({ name: 42 }), {}),
      fakeRepo({ upsert: () => Promise.resolve() }),
    );
    assert.equal(profile.name, 'User');
    assert.equal(profile.photoURL, null);
  });
});
