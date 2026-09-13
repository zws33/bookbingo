import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { BookMetadata } from '@bookbingo/lib-types';
import { createManualBookHandler } from './manual.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const METADATA: BookMetadata = {
  pageCount: null,
  publishedDate: null,
  categories: [],
  language: null,
  isbn: null,
  thumbnailUrl: null,
};

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

describe('createManualBookHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      createManualBookHandler(
        makeRequest(undefined, {
          title: 'Dune',
          author: 'Frank Herbert',
          metadata: METADATA,
        }),
      ),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument for a whitespace-only title', async () => {
    await assert.rejects(
      createManualBookHandler(
        makeRequest(AUTH, {
          title: '  ',
          author: 'Frank Herbert',
          metadata: METADATA,
        }),
      ),
      { code: 'invalid-argument' },
    );
  });

  test('throws invalid-argument for a punctuation-only title or author', async () => {
    for (const [title, author] of [
      ['!!!', 'Frank Herbert'],
      ['Dune', '...'],
    ]) {
      await assert.rejects(
        createManualBookHandler(
          makeRequest(AUTH, { title, author, metadata: METADATA }),
        ),
        { code: 'invalid-argument' },
      );
    }
  });
});
