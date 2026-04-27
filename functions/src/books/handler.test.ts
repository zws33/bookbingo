import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { enrichBookHandler } from './handler.js';
import { BookSearchResult, BookEnrichmentResult } from './types.js';
import type { CallableRequest } from 'firebase-functions/v2/https';

type MockAuth = { uid: string; token: Record<string, unknown>; rawToken: string } | undefined;

function makeRequest(auth: MockAuth, data: unknown): CallableRequest<unknown> {
  return { auth, data, rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'], acceptsStreaming: false } as CallableRequest<unknown>;
}

describe('enrichBookHandler', () => {
  const originalFetch = global.fetch;

  before(() => {
    // Mock global fetch
    global.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/volumes?')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'test-id-1',
                volumeInfo: {
                  title: 'Test Book',
                  authors: ['Test Author'],
                  imageLinks: { thumbnail: 'http://example.com/thumb.jpg' },
                  publishedDate: '2022-01-01',
                },
              },
            ],
          }),
        } as unknown as Response;
      }
      if (urlStr.includes('/volumes/test-id-1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'test-id-1',
            volumeInfo: {
              title: 'Test Book',
              authors: ['Test Author'],
              pageCount: 300,
              publishedDate: '2022-01-01',
              categories: ['Fiction'],
              language: 'en',
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '1234567890123' }],
              imageLinks: { thumbnail: 'http://example.com/thumb.jpg' },
            },
          }),
        } as unknown as Response;
      }
      return { ok: false, statusText: 'Not Found' } as unknown as Response;
    }) as typeof fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      enrichBookHandler(makeRequest(undefined, { action: 'search' })),
      { code: 'unauthenticated' }
    );
  });

  test('search returns mapped results', async () => {
    const results = await enrichBookHandler(
      makeRequest({ uid: 'user-1', token: {}, rawToken: 'test' }, { action: 'search', query: 'test' })
    ) as BookSearchResult[];

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].externalId, 'test-id-1');
    assert.strictEqual(results[0].title, 'Test Book');
    assert.strictEqual(results[0].author, 'Test Author');
  });

  test('lookup returns enriched metadata', async () => {
    const result = await enrichBookHandler(
      makeRequest({ uid: 'user-1', token: {}, rawToken: 'test' }, { action: 'lookup', externalId: 'test-id-1' })
    ) as BookEnrichmentResult;

    assert.strictEqual(result.externalId, 'test-id-1');
    assert.strictEqual(result.metadata.pageCount, 300);
    assert.strictEqual(result.metadata.isbn, '1234567890123');
  });

  test('throws invalid-argument for missing action', async () => {
    await assert.rejects(
      enrichBookHandler(makeRequest({ uid: 'user-1', token: {}, rawToken: 'test' }, { action: 'invalid' as unknown as 'search' })),
      { code: 'invalid-argument' }
    );
  });
});
