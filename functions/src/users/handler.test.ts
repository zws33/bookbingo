import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getUserProfileHandler, listUsersHandler } from './handler.js';
import { toUserProfile } from './store.js';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

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
