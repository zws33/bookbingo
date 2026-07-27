import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OpenLibraryProvider } from './open-library.js';

const SEARCH_PAYLOAD = {
  docs: [
    {
      key: '/works/OL1W',
      title: 'Dune',
      author_name: ['Frank Herbert'],
      first_publish_year: 1965,
      cover_i: 42,
    },
  ],
};

const WORK_PAYLOAD = {
  title: 'Dune',
  authors: [{ author: { key: '/authors/OL1A' } }],
  subjects: ['Science fiction'],
  covers: [42],
  first_publish_date: '1965',
};

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    statusText: 'OK',
    json: async () => payload,
  } as unknown as Response;
}

function errorResponse(statusText: string): Response {
  return { ok: false, statusText } as unknown as Response;
}

/** Yields to the microtask/macrotask queue so concurrent work can start. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('OpenLibraryProvider', () => {
  const originalFetch = global.fetch;
  let requestedUrls: string[];
  let clock: number;

  before(() => {
    clock = 0;
  });

  beforeEach(() => {
    requestedUrls = [];
    clock = 0;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  type ProviderOptions = NonNullable<
    ConstructorParameters<typeof OpenLibraryProvider>[0]
  >;

  function makeProvider(overrides: Partial<ProviderOptions> = {}) {
    return new OpenLibraryProvider({ now: () => clock, ...overrides });
  }

  /** Records every request and answers search calls with SEARCH_PAYLOAD. */
  function installSearchFetch(response: () => Response = () =>
    jsonResponse(SEARCH_PAYLOAD)) {
    global.fetch = (async (input: string | URL) => {
      requestedUrls.push(String(input));
      return response();
    }) as typeof fetch;
  }

  describe('search caching', () => {
    test('serves repeat queries within the TTL from cache', async () => {
      installSearchFetch();
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      const first = await provider.search('dune');
      clock = 999;
      const second = await provider.search('dune');

      assert.equal(requestedUrls.length, 1);
      assert.deepEqual(first, second);
      assert.equal(first[0]?.title, 'Dune');
    });

    test('collapses concurrent identical queries onto one request', async () => {
      global.fetch = (async (input: string | URL) => {
        requestedUrls.push(String(input));
        await tick();
        return jsonResponse(SEARCH_PAYLOAD);
      }) as typeof fetch;
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      const results = await Promise.all([
        provider.search('dune'),
        provider.search('dune'),
        provider.search('dune'),
      ]);

      assert.equal(requestedUrls.length, 1);
      assert.deepEqual(results[0], results[2]);
    });

    test('refetches once the TTL has elapsed', async () => {
      installSearchFetch();
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      await provider.search('dune');
      clock = 1001;
      await provider.search('dune');

      assert.equal(requestedUrls.length, 2);
    });

    test('treats the TTL boundary as expired', async () => {
      installSearchFetch();
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      await provider.search('dune');
      clock = 1000;
      await provider.search('dune');

      assert.equal(requestedUrls.length, 2);
    });

    test('does not cache a failed request', async () => {
      let shouldFail = true;
      installSearchFetch(() =>
        shouldFail ? errorResponse('Server Error') : jsonResponse(SEARCH_PAYLOAD),
      );
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      await assert.rejects(provider.search('dune'), /OpenLibrary search failed/);

      shouldFail = false;
      const retried = await provider.search('dune');

      assert.equal(requestedUrls.length, 2);
      assert.equal(retried[0]?.title, 'Dune');
    });

    test('expires an empty result on the shortened TTL', async () => {
      installSearchFetch(() => jsonResponse({ docs: [] }));
      const provider = makeProvider({
        searchCacheTtlMs: 10_000,
        emptySearchCacheTtlMs: 100,
      });

      const first = await provider.search('nonesuch');
      assert.deepEqual(first, []);

      clock = 99;
      await provider.search('nonesuch');
      assert.equal(requestedUrls.length, 1, 'still within the shortened TTL');

      clock = 100;
      await provider.search('nonesuch');
      assert.equal(requestedUrls.length, 2, 'shortened TTL has elapsed');
    });

    test('keeps the full TTL for a non-empty result', async () => {
      installSearchFetch();
      const provider = makeProvider({
        searchCacheTtlMs: 10_000,
        emptySearchCacheTtlMs: 100,
      });

      await provider.search('dune');
      // Well past the empty TTL, well inside the full one.
      clock = 5000;
      await provider.search('dune');

      assert.equal(requestedUrls.length, 1);
    });

    test('rejects every concurrent caller and caches nothing', async () => {
      let shouldFail = true;
      global.fetch = (async (input: string | URL) => {
        requestedUrls.push(String(input));
        await tick();
        return shouldFail
          ? errorResponse('Server Error')
          : jsonResponse(SEARCH_PAYLOAD);
      }) as typeof fetch;
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      const settled = await Promise.allSettled([
        provider.search('dune'),
        provider.search('dune'),
        provider.search('dune'),
      ]);

      assert.equal(
        settled.filter((s) => s.status === 'rejected').length,
        3,
        'the shared failure reaches every coalesced caller',
      );
      assert.equal(requestedUrls.length, 1);

      // The failed entry must have been evicted, not left to occupy the TTL.
      shouldFail = false;
      const retried = await provider.search('dune');
      assert.equal(requestedUrls.length, 2);
      assert.equal(retried[0]?.title, 'Dune');
    });

    test('keys distinct queries separately', async () => {
      installSearchFetch();
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      await provider.search('dune');
      await provider.search('neuromancer');

      assert.equal(requestedUrls.length, 2);
      assert.ok(requestedUrls[0]?.includes('q=dune'));
      assert.ok(requestedUrls[1]?.includes('q=neuromancer'));
    });

    test('shares one entry across case and whitespace variants', async () => {
      installSearchFetch();
      const provider = makeProvider({ searchCacheTtlMs: 1000 });

      await provider.search('Dune  Herbert');
      await provider.search('  dune herbert ');

      assert.equal(requestedUrls.length, 1);
    });

    test('evicts the oldest entry when over the size cap', async () => {
      installSearchFetch();
      const provider = makeProvider({
        searchCacheTtlMs: 1000,
        searchCacheMaxEntries: 2,
      });

      await provider.search('one');
      await provider.search('two');
      await provider.search('three'); // evicts 'one'
      await provider.search('two'); // still cached
      await provider.search('one'); // evicted, refetches

      assert.equal(requestedUrls.length, 4);
    });
  });

  describe('lookup fan-out', () => {
    test('issues the author and editions requests concurrently', async () => {
      let editionsStarted = false;
      let authorSawEditionsStarted = false;

      global.fetch = (async (input: string | URL) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes('/authors/')) {
          // Yield, giving a concurrent editions request the chance to start.
          await tick();
          authorSawEditionsStarted = editionsStarted;
          return jsonResponse({ name: 'Frank Herbert' });
        }
        if (url.includes('/editions.json')) {
          editionsStarted = true;
          return jsonResponse({ entries: [{ number_of_pages: 412 }] });
        }
        return jsonResponse(WORK_PAYLOAD);
      }) as typeof fetch;

      const result = await makeProvider().lookup('/works/OL1W');

      assert.equal(
        authorSawEditionsStarted,
        true,
        'editions request should start before the author request settles',
      );
      assert.equal(result.author, 'Frank Herbert');
      assert.equal(result.metadata.pageCount, 412);
    });

    test('still resolves when the author and editions lookups fail', async () => {
      global.fetch = (async (input: string | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith('/works/OL1W.json')) {
          return jsonResponse(WORK_PAYLOAD);
        }
        return errorResponse('Not Found');
      }) as typeof fetch;

      const result = await makeProvider().lookup('/works/OL1W');

      assert.equal(result.author, '');
      assert.equal(result.metadata.pageCount, null);
      assert.equal(result.metadata.thumbnailUrl?.includes('42'), true);
    });

    test('throws when the work lookup fails', async () => {
      installSearchFetch(() => errorResponse('Not Found'));

      await assert.rejects(
        makeProvider().lookup('/works/OL1W'),
        /OpenLibrary work lookup failed/,
      );
    });
  });
});
