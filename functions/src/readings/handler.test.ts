import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  createReadingHandler,
  deleteReadingHandler,
  listReadingsHandler,
  updateReadingHandler,
} from './handler.js';
import type { ReadingRepository } from './store.js';
import { DomainError } from '../common/errors.js';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

/** Every method rejects unless the test overrides it, so an unexpected call fails loudly. */
function fakeRepo(overrides: Partial<ReadingRepository>): ReadingRepository {
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

describe('listReadingsHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      listReadingsHandler(makeRequest(undefined, { userId: 'user-1' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when userId is missing', async () => {
    await assert.rejects(listReadingsHandler(makeRequest(AUTH, {})), {
      code: 'invalid-argument',
    });
  });
});

describe('createReadingHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      createReadingHandler(
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
      createReadingHandler(
        makeRequest(AUTH, { tiles: [t1], isFreebie: false }),
      ),
      { code: 'invalid-argument' },
    );
  });

  // The tile rules reject before any Firestore call, so they are testable here.
  test('rejects a fourth tile on a non-freebie', async () => {
    await assert.rejects(
      createReadingHandler(
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
      createReadingHandler(
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

describe('updateReadingHandler', () => {
  test('throws invalid-argument when readingId is missing', async () => {
    await assert.rejects(
      updateReadingHandler(
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

describe('deleteReadingHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      deleteReadingHandler(makeRequest(undefined, { readingId: 'r1' })),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when readingId is empty', async () => {
    await assert.rejects(
      deleteReadingHandler(makeRequest(AUTH, { readingId: '' })),
      { code: 'invalid-argument' },
    );
  });
});

describe('createReadingHandler with a fake repository', () => {
  test('returns the id the repository assigned', async () => {
    const result = await createReadingHandler(
      makeRequest(AUTH, { bookId: 'book-1', tiles: [t1], isFreebie: false }),
      fakeRepo({ create: () => Promise.resolve('r-new') }),
    );
    assert.deepEqual(result, { readingId: 'r-new' });
  });

  test('passes the parsed fields through to the repository', async () => {
    const calls: unknown[] = [];
    await createReadingHandler(
      makeRequest(AUTH, { bookId: 'book-1', tiles: [t1, t2], isFreebie: true }),
      fakeRepo({
        create: (uid, fields) => {
          calls.push({ uid, fields });
          return Promise.resolve('r-new');
        },
      }),
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
      createReadingHandler(
        makeRequest(AUTH, { bookId: 'book-1', tiles: [t1], isFreebie: true }),
        fakeRepo({
          create: () =>
            Promise.reject(
              new DomainError(
                'conflict',
                'You already have a freebie reading.',
              ),
            ),
        }),
      ),
      { name: 'DomainError', kind: 'conflict' },
    );
  });
});

describe('updateReadingHandler with a fake repository', () => {
  test('passes the reading id and fields through', async () => {
    const calls: unknown[] = [];
    await updateReadingHandler(
      makeRequest(AUTH, {
        readingId: 'r1',
        bookId: 'book-1',
        tiles: [t1],
        isFreebie: false,
      }),
      fakeRepo({
        update: (uid, readingId, fields) => {
          calls.push({ uid, readingId, fields });
          return Promise.resolve();
        },
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
      updateReadingHandler(
        makeRequest(AUTH, {
          readingId: 'gone',
          bookId: 'book-1',
          tiles: [t1],
          isFreebie: false,
        }),
        fakeRepo({
          update: () =>
            Promise.reject(
              new DomainError('not-found', 'That reading no longer exists.'),
            ),
        }),
      ),
      { name: 'DomainError', kind: 'not-found' },
    );
  });
});

describe('deleteReadingHandler with a fake repository', () => {
  test('removes the reading under the caller uid', async () => {
    const calls: unknown[] = [];
    await deleteReadingHandler(
      makeRequest(AUTH, { readingId: 'r1' }),
      fakeRepo({
        remove: (uid, readingId) => {
          calls.push({ uid, readingId });
          return Promise.resolve();
        },
      }),
    );
    assert.deepEqual(calls, [{ uid: 'user-1', readingId: 'r1' }]);
  });
});

describe('listReadingsHandler with a fake repository', () => {
  // A non-empty list reaches attachBooks, which reads Firestore directly, so
  // only the empty case is coverable until the books repository is injected.
  test('returns a zero score when the user has no readings', async () => {
    const result = await listReadingsHandler(
      makeRequest(AUTH, { userId: 'user-1' }),
      fakeRepo({ list: () => Promise.resolve([]) }),
    );
    assert.deepEqual(result.readings, []);
    assert.equal(result.score.score, 0);
    assert.equal(result.score.totalBooks, 0);
  });
});
