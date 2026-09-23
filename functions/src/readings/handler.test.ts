import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { readingHandlers } from './handler.js';
import type { ReadingRepository } from './store.js';
import type { UserProfileRepository } from '../users/store.js';
import { DomainError } from '../common/errors.js';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

/** Every method rejects unless the test overrides it, so an unexpected call fails loudly. */
function fakeRepo(
  overrides: Partial<ReadingRepository> = {},
): ReadingRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
  return {
    list: unexpected('list'),
    listAllByUser: unexpected('listAllByUser'),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
    ...overrides,
  };
}

function fakeUsersRepo(
  overrides: Partial<UserProfileRepository> = {},
): UserProfileRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
  return {
    list: unexpected('list'),
    get: unexpected('get'),
    upsert: unexpected('upsert'),
    ...overrides,
  };
}

const handlers = (
  readings: Partial<ReadingRepository> = {},
  users: Partial<UserProfileRepository> = {},
) => readingHandlers(fakeRepo(readings), fakeUsersRepo(users));

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

describe('readingHandlers.list', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      handlers().list(makeRequest(undefined, { userId: 'user-1' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when userId is missing', async () => {
    await assert.rejects(handlers().list(makeRequest(AUTH, {})), {
      code: 'invalid-argument',
    });
  });
});

describe('readingHandlers.create', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(undefined, {
          bookId: 'book-1',
          tiles: [t1],
          isFreebie: false,
        }),
      ),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when bookId is missing', async () => {
    await assert.rejects(
      handlers().create(makeRequest(AUTH, { tiles: [t1], isFreebie: false })),
      { code: 'invalid-argument' },
    );
  });

  // The tile rules reject before any Firestore call, so they are testable here.
  test('rejects a fourth tile on a non-freebie', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, {
          bookId: 'book-1',
          tiles: [t1, t2, t3, t4],
          isFreebie: false,
        }),
      ),
      { name: 'DomainError', kind: 'invalid-input' },
    );
  });

  test('rejects a tile that is not in the catalog', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, {
          bookId: 'book-1',
          tiles: ['not-a-tile'],
          isFreebie: false,
        }),
      ),
      { name: 'DomainError', kind: 'invalid-input' },
    );
  });
});

describe('readingHandlers.update', () => {
  test('throws invalid-argument when readingId is missing', async () => {
    await assert.rejects(
      handlers().update(
        makeRequest(AUTH, {
          bookId: 'book-1',
          tiles: [t1],
          isFreebie: false,
        }),
      ),
      { code: 'invalid-argument' },
    );
  });
});

describe('readingHandlers.remove', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      handlers().remove(makeRequest(undefined, { readingId: 'r1' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when readingId is empty', async () => {
    await assert.rejects(
      handlers().remove(makeRequest(AUTH, { readingId: '' })),
      { code: 'invalid-argument' },
    );
  });
});

describe('readingHandlers.create (fake repository)', () => {
  test('returns the id the repository assigned', async () => {
    const result = await handlers({
      create: () => Promise.resolve('r-new'),
    }).create(
      makeRequest(AUTH, { bookId: 'book-1', tiles: [t1], isFreebie: false }),
    );
    assert.deepEqual(result, { readingId: 'r-new' });
  });

  test('passes the parsed fields through to the repository', async () => {
    const calls: unknown[] = [];
    await handlers({
      create: (uid, fields) => {
        calls.push({ uid, fields });
        return Promise.resolve('r-new');
      },
    }).create(
      makeRequest(AUTH, { bookId: 'book-1', tiles: [t1, t2], isFreebie: true }),
    );
    assert.deepEqual(calls, [
      {
        uid: 'user-1',
        fields: { bookId: 'book-1', tiles: [t1, t2], isFreebie: true },
      },
    ]);
  });

  test('surfaces a repository conflict rather than reporting success', async () => {
    await assert.rejects(
      handlers({
        create: () =>
          Promise.reject(
            new DomainError('conflict', 'You already have a freebie reading.'),
          ),
      }).create(
        makeRequest(AUTH, { bookId: 'book-1', tiles: [t1], isFreebie: true }),
      ),
      { name: 'DomainError', kind: 'conflict' },
    );
  });
});

describe('readingHandlers.update (fake repository)', () => {
  test('passes the reading id and fields through', async () => {
    const calls: unknown[] = [];
    await handlers({
      update: (uid, readingId, fields) => {
        calls.push({ uid, readingId, fields });
        return Promise.resolve();
      },
    }).update(
      makeRequest(AUTH, {
        readingId: 'r1',
        bookId: 'book-1',
        tiles: [t1],
        isFreebie: false,
      }),
    );
    assert.deepEqual(calls, [
      {
        uid: 'user-1',
        readingId: 'r1',
        fields: { bookId: 'book-1', tiles: [t1], isFreebie: false },
      },
    ]);
  });

  test('surfaces a missing reading', async () => {
    await assert.rejects(
      handlers({
        update: () =>
          Promise.reject(
            new DomainError('not-found', 'That reading no longer exists.'),
          ),
      }).update(
        makeRequest(AUTH, {
          readingId: 'gone',
          bookId: 'book-1',
          tiles: [t1],
          isFreebie: false,
        }),
      ),
      { name: 'DomainError', kind: 'not-found' },
    );
  });
});

describe('readingHandlers.remove (fake repository)', () => {
  test('removes the reading under the caller uid', async () => {
    const calls: unknown[] = [];
    await handlers({
      remove: (uid, readingId) => {
        calls.push({ uid, readingId });
        return Promise.resolve();
      },
    }).remove(makeRequest(AUTH, { readingId: 'r1' }));
    assert.deepEqual(calls, [{ uid: 'user-1', readingId: 'r1' }]);
  });
});

describe('readingHandlers.list (fake repository)', () => {
  // A non-empty list reaches attachBooks, which reads Firestore directly, so
  // only the empty case is coverable until the books repository is injected.
  test('returns a zero score when the user has no readings', async () => {
    const result = await handlers({ list: () => Promise.resolve([]) }).list(
      makeRequest(AUTH, { userId: 'user-1' }),
    );
    assert.deepEqual(result.readings, []);
    assert.equal(result.score.score, 0);
    assert.equal(result.score.totalBooks, 0);
  });
});
