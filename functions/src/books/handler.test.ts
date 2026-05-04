import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { enrichBookHandler } from './handler.js';
import type { CallableRequest } from 'firebase-functions/v2/https';

type MockAuth =
  | { uid: string; token: Record<string, unknown>; rawToken: string }
  | undefined;

function makeRequest(auth: MockAuth, data: unknown): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

describe('enrichBookHandler', () => {
  const originalFetch = global.fetch;

  before(() => {
    // Mock global fetch
    global.fetch = (async (_: string | URL) => {
      return { ok: false, statusText: 'Not Found' } as unknown as Response;
    }) as typeof fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      enrichBookHandler(makeRequest(undefined, { action: 'search' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument for missing action', async () => {
    await assert.rejects(
      enrichBookHandler(
        makeRequest(
          { uid: 'user-1', token: {}, rawToken: 'test' },
          { action: 'invalid' as unknown as 'search' },
        ),
      ),
      { code: 'invalid-argument' },
    );
  });
});
