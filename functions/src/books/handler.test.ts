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

  test('throws invalid-argument for a whitespace-only search query', async () => {
    await assert.rejects(
      enrichBookHandler(
        makeRequest(
          { uid: 'user-1', token: {}, rawToken: 'test' },
          { action: 'search', query: '  ' },
        ),
      ),
      { code: 'invalid-argument' },
    );
  });

  test('throws invalid-argument for an unrecognised action', async () => {
    await assert.rejects(
      enrichBookHandler(
        makeRequest(
          { uid: 'user-1', token: {}, rawToken: 'test' },
          { action: 'bogus' },
        ),
      ),
      { code: 'invalid-argument' },
    );
  });

  // Classification is the difference between "this book is gone, stop" and
  // "Open Library is down, retry" — a distinction the caller acts on.
  describe('upstream failure classification', () => {
    function lookup() {
      return enrichBookHandler(
        makeRequest(
          { uid: 'user-1', token: {}, rawToken: 'test' },
          { action: 'lookup', externalId: '/works/OL1W' },
        ),
      );
    }

    function respondWith(status: number, statusText: string) {
      global.fetch = (async () =>
        ({
          ok: false,
          status,
          statusText,
        }) as unknown as Response) as typeof fetch;
    }

    test('maps an upstream 404 to not-found', async () => {
      respondWith(404, 'Not Found');
      await assert.rejects(lookup(), { code: 'not-found' });
    });

    test('maps an upstream 500 to unavailable', async () => {
      respondWith(500, 'Internal Server Error');
      await assert.rejects(lookup(), { code: 'unavailable' });
    });

    test('maps an upstream 429 to unavailable', async () => {
      respondWith(429, 'Too Many Requests');
      await assert.rejects(lookup(), { code: 'unavailable' });
    });

    test('maps a transport failure to unavailable', async () => {
      global.fetch = (async () => {
        throw new Error('fetch failed', { cause: new Error('ECONNRESET') });
      }) as typeof fetch;
      await assert.rejects(lookup(), { code: 'unavailable' });
    });

    test('does not forward the upstream error text to the caller', async () => {
      respondWith(500, 'Internal Server Error');
      await assert.rejects(lookup(), (error) => {
        assert.doesNotMatch((error as Error).message, /OpenLibrary/);
        return true;
      });
    });
  });
});
