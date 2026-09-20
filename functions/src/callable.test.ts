import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import { parseRequest, requireAuth } from './callable.js';

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

describe('requireAuth', () => {
  test('returns the verified auth, uid included', () => {
    assert.equal(
      requireAuth(makeRequest(AUTH, {}), 'add a book').uid,
      'user-1',
    );
  });

  test('returns the token so callers can read profile claims', () => {
    const auth = { ...AUTH, token: { name: 'Ada', picture: null } };
    assert.equal(
      requireAuth(makeRequest(auth, {}), 'add a book').token.name,
      'Ada',
    );
  });

  test('throws unauthenticated naming the action', () => {
    assert.throws(() => requireAuth(makeRequest(undefined, {}), 'add a book'), {
      code: 'unauthenticated',
      message: 'Must be signed in to add a book.',
    });
  });
});

describe('parseRequest', () => {
  const schema = z.object({ tiles: z.array(z.string()).max(3) });

  test('returns the parsed payload', () => {
    assert.deepEqual(parseRequest(schema, { tiles: ['t01'] }), {
      tiles: ['t01'],
    });
  });

  test('throws invalid-argument for a payload the schema rejects', () => {
    assert.throws(() => parseRequest(schema, { tiles: 't01' }), {
      code: 'invalid-argument',
    });
  });

  test('reports the failing field so the client can correct it', () => {
    assert.throws(
      () => parseRequest(schema, { tiles: ['t01', 't02', 't03', 't04'] }),
      (error: unknown) => {
        assert.match((error as Error).message, /tiles/);
        return true;
      },
    );
  });
});
