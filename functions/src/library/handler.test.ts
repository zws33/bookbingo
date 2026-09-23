import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { libraryHandlers } from './handler.js';
import type { ReadingRepository } from '../readings/store.js';
import type { UserProfileRepository } from '../users/store.js';
import type { BookRepository } from '../books/store.js';

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

const handlers = () =>
  libraryHandlers(
    {
      list: unexpected('list'),
      listAllByUser: unexpected('listAllByUser'),
      create: unexpected('create'),
      update: unexpected('update'),
      remove: unexpected('remove'),
    } satisfies ReadingRepository,
    {
      list: unexpected('list'),
      get: unexpected('get'),
      upsert: unexpected('upsert'),
    } satisfies UserProfileRepository,
    { getByIds: unexpected('getByIds') } satisfies BookRepository,
  );

function makeRequest(auth: unknown): CallableRequest<unknown> {
  return {
    auth,
    data: {},
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

describe('libraryHandlers.get', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(handlers().get(makeRequest(undefined)), {
      code: 'unauthenticated',
    });
  });
});
