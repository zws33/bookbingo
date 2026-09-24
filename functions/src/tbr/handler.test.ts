import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { tbrHandlers } from './handler.js';
import type { TBREntryRepository } from './store.js';
import { DomainError } from '../common/errors.js';
import type { BookRepository } from '../books/store.js';
import type { Book } from '@bookbingo/lib-types';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

/** Every method rejects unless the test overrides it, so an unexpected call fails loudly. */
function fakeRepo(
  overrides: Partial<TBREntryRepository> = {},
): TBREntryRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
  return {
    list: unexpected('list'),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
    promote: unexpected('promote'),
    ...overrides,
  };
}

function fakeBooksRepo(books: Map<string, Book> = new Map()): BookRepository {
  return { getByIds: () => Promise.resolve(books) };
}

const handlers = (
  overrides: Partial<TBREntryRepository> = {},
  books: Map<string, Book> = new Map(),
) => tbrHandlers(fakeRepo(overrides), fakeBooksRepo(books));

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

describe('tbrHandlers.list', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(handlers().list(makeRequest(undefined, {})), {
      code: 'unauthenticated',
    });
  });
});

describe('tbrHandlers.create', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(undefined, { bookId: 'book-1', plannedTiles: [] }),
      ),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when bookId is missing', async () => {
    await assert.rejects(
      handlers().create(makeRequest(AUTH, { plannedTiles: [] })),
      { code: 'invalid-argument' },
    );
  });

  test('rejects a planned tile that is not in the catalog', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, { bookId: 'book-1', plannedTiles: ['not-a-tile'] }),
      ),
      { name: 'DomainError', kind: 'invalid-input' },
    );
  });

  test('rejects notes past the length limit', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, {
          bookId: 'book-1',
          plannedTiles: [],
          notes: 'x'.repeat(2001),
        }),
      ),
      { code: 'invalid-argument' },
    );
  });
});

describe('tbrHandlers.update', () => {
  test('throws invalid-argument when tbrId is missing', async () => {
    await assert.rejects(
      handlers().update(makeRequest(AUTH, { plannedTiles: [] })),
      { code: 'invalid-argument' },
    );
  });
});

describe('tbrHandlers.remove', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      handlers().remove(makeRequest(undefined, { tbrId: 'tbr-1' })),
      { code: 'unauthenticated' },
    );
  });
});

describe('tbrHandlers.promote', () => {
  test('throws invalid-argument when isFreebie is missing', async () => {
    await assert.rejects(
      handlers().promote(makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1] })),
      { code: 'invalid-argument' },
    );
  });

  test('throws invalid-argument when tbrId is missing', async () => {
    await assert.rejects(
      handlers().promote(makeRequest(AUTH, { tiles: [t1], isFreebie: false })),
      { code: 'invalid-argument' },
    );
  });

  // Promote writes a reading, so it enforces the reading tile rules, not the
  // looser planning ones.
  test('rejects a fourth tile on a non-freebie promotion', async () => {
    await assert.rejects(
      handlers().promote(
        makeRequest(AUTH, {
          tbrId: 'tbr-1',
          tiles: [t1, t2, t3, t4],
          isFreebie: false,
        }),
      ),
      { name: 'DomainError', kind: 'invalid-input' },
    );
  });
});

describe('tbrHandlers.create (fake repository)', () => {
  test('returns the id the repository assigned', async () => {
    const result = await handlers({
      create: () => Promise.resolve('tbr-new'),
    }).create(makeRequest(AUTH, { bookId: 'book-1', plannedTiles: [t1] }));
    assert.deepEqual(result, { tbrId: 'tbr-new' });
  });

  test('surfaces a book that is not in the catalog', async () => {
    await assert.rejects(
      handlers({
        create: () =>
          Promise.reject(
            new DomainError('not-found', 'That book is not in the catalog.'),
          ),
      }).create(makeRequest(AUTH, { bookId: 'ghost', plannedTiles: [] })),
      { name: 'DomainError', kind: 'not-found' },
    );
  });
});

describe('tbrHandlers.update (fake repository)', () => {
  test('passes the entry id and fields through', async () => {
    const calls: unknown[] = [];
    await handlers({
      update: (uid, tbrId, fields) => {
        calls.push({ uid, tbrId, fields });
        return Promise.resolve();
      },
    }).update(
      makeRequest(AUTH, { tbrId: 'tbr-1', plannedTiles: [t1], notes: 'soon' }),
    );
    assert.deepEqual(calls, [
      {
        uid: 'user-1',
        tbrId: 'tbr-1',
        fields: { plannedTiles: [t1], notes: 'soon' },
      },
    ]);
  });
});

describe('tbrHandlers.remove (fake repository)', () => {
  test('removes the entry under the caller uid', async () => {
    const calls: unknown[] = [];
    await handlers({
      remove: (uid, tbrId) => {
        calls.push({ uid, tbrId });
        return Promise.resolve();
      },
    }).remove(makeRequest(AUTH, { tbrId: 'tbr-1' }));
    assert.deepEqual(calls, [{ uid: 'user-1', tbrId: 'tbr-1' }]);
  });
});

describe('tbrHandlers.promote (fake repository)', () => {
  test('returns the reading id the promotion produced', async () => {
    const result = await handlers({
      promote: () =>
        Promise.resolve({
          readingId: 'tbr-1',
          bookId: 'book-1',
          alreadyLogged: false,
        }),
    }).promote(
      makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: false }),
    );
    assert.deepEqual(result, { readingId: 'tbr-1' });
  });

  // A retry whose first response was lost must report the reading, not a
  // missing entry for a book the user did log.
  test('reports the existing reading when the entry was already promoted', async () => {
    const result = await handlers({
      promote: () =>
        Promise.resolve({
          readingId: 'tbr-1',
          bookId: 'book-1',
          alreadyLogged: true,
        }),
    }).promote(
      makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: false }),
    );
    assert.deepEqual(result, { readingId: 'tbr-1' });
  });

  test('surfaces a freebie conflict', async () => {
    await assert.rejects(
      handlers({
        promote: () =>
          Promise.reject(
            new DomainError('conflict', 'You already have a freebie reading.'),
          ),
      }).promote(
        makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: true }),
      ),
      { name: 'DomainError', kind: 'conflict' },
    );
  });
});

const EMPTY_METADATA = {
  pageCount: null,
  publishedDate: null,
  categories: [],
  language: null,
  isbn: null,
  thumbnailUrl: null,
};

const BOOK: Book = {
  id: 'book-1',
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  metadata: EMPTY_METADATA,
};

describe('tbrHandlers.list (fake repository)', () => {
  // A non-empty list reaches attachBooks, which reads Firestore directly.
  test('returns an empty list when the user has no entries', async () => {
    const result = await handlers({ list: () => Promise.resolve([]) }).list(
      makeRequest(AUTH, {}),
    );
    assert.deepEqual(result, []);
  });

  test('flattens the joined book and keeps an absent note absent', async () => {
    const result = await handlers(
      {
        list: () =>
          Promise.resolve([
            {
              id: 'tbr-1',
              bookId: 'book-1',
              plannedTiles: [t1!],
              addedAt: new Date('2026-01-02T03:04:05.000Z'),
            },
          ]),
      },
      new Map([['book-1', BOOK]]),
    ).list(makeRequest(AUTH, {}));

    assert.deepEqual(result, [
      {
        id: 'tbr-1',
        bookId: 'book-1',
        plannedTiles: [t1],
        addedAt: '2026-01-02T03:04:05.000Z',
        bookTitle: 'The Left Hand of Darkness',
        bookAuthor: 'Ursula K. Le Guin',
        bookMetadata: EMPTY_METADATA,
      },
    ]);
  });
});
