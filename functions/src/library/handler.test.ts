import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getLibraryHandler } from './handler.js';

function makeRequest(auth: unknown): CallableRequest<unknown> {
  return {
    auth,
    data: {},
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

describe('getLibraryHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(getLibraryHandler(makeRequest(undefined)), {
      code: 'unauthenticated',
    });
  });
});
