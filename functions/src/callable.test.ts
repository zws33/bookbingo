import { test, describe } from 'node:test';
import assert from 'node:assert';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import {
  callable,
  parseRequest,
  requireAuth,
  toHttpsError,
} from './callable.js';
import { DomainError } from './common/errors.js';

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

describe('toHttpsError', () => {
  const FALLBACK = 'Could not load those readings.';

  test('maps invalid-input to invalid-argument, forwarding the message', () => {
    const mapped = toHttpsError(
      new DomainError('invalid-input', 'Unknown tile: t99.'),
      FALLBACK,
    );
    assert.equal(mapped.code, 'invalid-argument');
    assert.equal(mapped.message, 'Unknown tile: t99.');
  });

  test('maps not-found, forwarding the message', () => {
    const mapped = toHttpsError(
      new DomainError('not-found', 'That reading no longer exists.'),
      FALLBACK,
    );
    assert.equal(mapped.code, 'not-found');
    assert.equal(mapped.message, 'That reading no longer exists.');
  });

  test('maps conflict to failed-precondition, forwarding the message', () => {
    const mapped = toHttpsError(
      new DomainError('conflict', 'You already have a freebie reading.'),
      FALLBACK,
    );
    assert.equal(mapped.code, 'failed-precondition');
    assert.equal(mapped.message, 'You already have a freebie reading.');
  });

  test('maps corrupt to internal without leaking the message', () => {
    const mapped = toHttpsError(
      new DomainError('corrupt', 'No book document for: book-1, book-2'),
      FALLBACK,
    );
    assert.equal(mapped.code, 'internal');
    assert.equal(mapped.message, FALLBACK);
  });

  test('maps an unrecognized throw to internal without leaking the message', () => {
    const mapped = toHttpsError(
      new Error('ECONNRESET reading users'),
      FALLBACK,
    );
    assert.equal(mapped.code, 'internal');
    assert.equal(mapped.message, FALLBACK);
  });

  test('passes an existing HttpsError through unchanged', () => {
    const original = new HttpsError('unauthenticated', 'Must be signed in.');
    assert.equal(toHttpsError(original, FALLBACK), original);
  });
});

describe('callable', () => {
  const FALLBACK = 'Failed to save your reading.';

  test('returns the handler result', async () => {
    const wrapped = callable(() => ({ readingId: 'r1' }), FALLBACK);
    assert.deepEqual(await wrapped(makeRequest(AUTH, {})), {
      readingId: 'r1',
    });
  });

  test('maps a DomainError thrown by the handler', async () => {
    const wrapped = callable(() => {
      throw new DomainError('conflict', 'You already have a freebie reading.');
    }, FALLBACK);
    await assert.rejects(wrapped(makeRequest(AUTH, {})), {
      code: 'failed-precondition',
      message: 'You already have a freebie reading.',
    });
  });

  test('maps a rejected promise, not just a synchronous throw', async () => {
    const wrapped = callable(
      () => Promise.reject(new DomainError('not-found', 'No such reading.')),
      FALLBACK,
    );
    await assert.rejects(wrapped(makeRequest(AUTH, {})), { code: 'not-found' });
  });

  test('leaves an HttpsError from requireAuth intact', async () => {
    const wrapped = callable(
      (request) => requireAuth(request, 'log a reading'),
      FALLBACK,
    );
    await assert.rejects(wrapped(makeRequest(undefined, {})), {
      code: 'unauthenticated',
      message: 'Must be signed in to log a reading.',
    });
  });
});
