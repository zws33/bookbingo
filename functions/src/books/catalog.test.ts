import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getBooksHandler } from './catalog.js';

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

describe('getBooksHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      getBooksHandler(makeRequest(undefined, { ids: ['book-1'] })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when ids is not an array', async () => {
    await assert.rejects(
      getBooksHandler(makeRequest(AUTH, { ids: 'book-1' })),
      {
        code: 'invalid-argument',
      },
    );
  });

  test('throws invalid-argument for an empty id', async () => {
    await assert.rejects(getBooksHandler(makeRequest(AUTH, { ids: [''] })), {
      code: 'invalid-argument',
    });
  });

  test('throws invalid-argument past the request cap', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `book-${i}`);
    await assert.rejects(getBooksHandler(makeRequest(AUTH, { ids })), {
      code: 'invalid-argument',
    });
  });

  // No Firestore call, so this is the one read path testable without the emulator.
  test('returns an empty list without reading Firestore', async () => {
    assert.deepEqual(await getBooksHandler(makeRequest(AUTH, { ids: [] })), []);
  });
});
