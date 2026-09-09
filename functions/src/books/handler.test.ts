import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { fetchBookDetailsHandler, searchBooksHandler } from './handler.js';
import type { CallableRequest } from 'firebase-functions/v2/https';

type MockAuth =
  | { uid: string; token: Record<string, unknown>; rawToken: string }
  | undefined;

const AUTH: MockAuth = { uid: 'user-1', token: {}, rawToken: 'test' };

function makeRequest(auth: MockAuth, data: unknown): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

function respondWith(status: number, statusText: string) {
  global.fetch = (async () =>
    ({
      ok: false,
      status,
      statusText,
    }) as unknown as Response) as typeof fetch;
}

describe('searchBooksHandler', () => {
  const originalFetch = global.fetch;

  before(() => {
    global.fetch = (async (_: string | URL) => {
      return { ok: false, statusText: 'Not Found' } as unknown as Response;
    }) as typeof fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      searchBooksHandler(makeRequest(undefined, { q: 'dune' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when q is missing', async () => {
    await assert.rejects(searchBooksHandler(makeRequest(AUTH, {})), {
      code: 'invalid-argument',
    });
  });

  test('throws invalid-argument for a whitespace-only query', async () => {
    await assert.rejects(searchBooksHandler(makeRequest(AUTH, { q: '  ' })), {
      code: 'invalid-argument',
    });
  });

  test('throws invalid-argument for a non-string query', async () => {
    await assert.rejects(searchBooksHandler(makeRequest(AUTH, { q: 42 })), {
      code: 'invalid-argument',
    });
  });
});

describe('fetchBookDetailsHandler', () => {
  const originalFetch = global.fetch;

  before(() => {
    global.fetch = (async (_: string | URL) => {
      return { ok: false, statusText: 'Not Found' } as unknown as Response;
    }) as typeof fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      fetchBookDetailsHandler(
        makeRequest(undefined, { externalId: '/works/OL1W' }),
      ),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when externalId is missing', async () => {
    await assert.rejects(fetchBookDetailsHandler(makeRequest(AUTH, {})), {
      code: 'invalid-argument',
    });
  });

  test('throws invalid-argument for a whitespace-only externalId', async () => {
    await assert.rejects(
      fetchBookDetailsHandler(makeRequest(AUTH, { externalId: '  ' })),
      { code: 'invalid-argument' },
    );
  });

  // Classification is the difference between "this book is gone, stop" and
  // "Open Library is down, retry" — a distinction the caller acts on.
  describe('upstream failure classification', () => {
    function lookup() {
      return fetchBookDetailsHandler(
        makeRequest(AUTH, { externalId: '/works/OL1W' }),
      );
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
