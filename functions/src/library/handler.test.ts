import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Book, UserProfile } from '@bookbingo/lib-types';
import { libraryHandlers } from './handler.js';
import type { Reading, ReadingRepository } from '../readings/store.js';
import type { UserProfileRepository } from '../users/store.js';
import type { BookRepository } from '../books/store.js';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3] = TILES.map((tile) => tile.id);
const READ_AT = new Date('2026-01-02T03:04:05.000Z');

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

const EMPTY_METADATA = {
  pageCount: null,
  publishedDate: null,
  categories: [],
  language: null,
  isbn: null,
  thumbnailUrl: null,
};

const book = (id: string, title: string): Book => ({
  id,
  title,
  author: 'Ursula K. Le Guin',
  metadata: EMPTY_METADATA,
});

const reading = (id: string, bookId: string, tiles: string[]): Reading => ({
  id,
  bookId,
  tiles,
  isFreebie: false,
  readAt: READ_AT,
  createdAt: READ_AT,
});

const profile = (id: string, name: string): UserProfile => ({
  id,
  name,
  photoURL: null,
});

function handlers({
  byUser = new Map<string, Reading[]>(),
  profiles = [] as UserProfile[],
  books = new Map<string, Book>(),
}: {
  byUser?: Map<string, Reading[]>;
  profiles?: UserProfile[];
  books?: Map<string, Book>;
} = {}) {
  return libraryHandlers(
    {
      list: unexpected('list'),
      listAllByUser: () => Promise.resolve(byUser),
      create: unexpected('create'),
      update: unexpected('update'),
      remove: unexpected('remove'),
    } satisfies ReadingRepository,
    {
      list: () => Promise.resolve(profiles),
      get: unexpected('get'),
      upsert: unexpected('upsert'),
    } satisfies UserProfileRepository,
    { getByIds: () => Promise.resolve(books) } satisfies BookRepository,
  );
}

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

  test('counts every reading of a book and unions their tiles', async () => {
    const result = await handlers({
      byUser: new Map([
        ['user-1', [reading('r1', 'book-1', [t1!, t2!])]],
        ['user-2', [reading('r2', 'book-1', [t2!, t3!])]],
      ]),
      profiles: [profile('user-1', 'Ada'), profile('user-2', 'Grace')],
      books: new Map([['book-1', book('book-1', 'Dune')]]),
    }).get(makeRequest(AUTH));

    assert.equal(result.length, 1);
    assert.equal(result[0]!.readCount, 2);
    assert.deepEqual([...result[0]!.uniqueTiles].sort(), [t1, t2, t3].sort());
    assert.deepEqual(result[0]!.readers.map((r) => r.name).sort(), [
      'Ada',
      'Grace',
    ]);
  });

  test('sorts books by title', async () => {
    const result = await handlers({
      byUser: new Map([
        [
          'user-1',
          [reading('r1', 'book-z', [t1!]), reading('r2', 'book-a', [t1!])],
        ],
      ]),
      profiles: [profile('user-1', 'Ada')],
      books: new Map([
        ['book-z', book('book-z', 'Zamyatin')],
        ['book-a', book('book-a', 'Anathem')],
      ]),
    }).get(makeRequest(AUTH));

    assert.deepEqual(
      result.map((entry) => entry.book.title),
      ['Anathem', 'Zamyatin'],
    );
  });

  // A reader who signed in but whose profile write never landed still counts
  // toward the book's tiles; there is no name to show, so the row is left out.
  test('leaves out a reader with no profile document', async () => {
    const result = await handlers({
      byUser: new Map([['ghost', [reading('r1', 'book-1', [t1!])]]]),
      profiles: [],
      books: new Map([['book-1', book('book-1', 'Dune')]]),
    }).get(makeRequest(AUTH));

    assert.deepEqual(result, []);
  });
});
