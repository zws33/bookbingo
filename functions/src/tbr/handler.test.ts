import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  createTBREntryHandler,
  deleteTBREntryHandler,
  listMyTBRHandler,
  promoteTBREntryHandler,
  updateTBREntryHandler,
} from './handler.js';
import type { TBREntryRepository } from './store.js';
import { DomainError } from '../common/errors.js';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

/** Every method rejects unless the test overrides it, so an unexpected call fails loudly. */
function fakeRepo(overrides: Partial<TBREntryRepository>): TBREntryRepository {
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

describe('listMyTBRHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(listMyTBRHandler(makeRequest(undefined, {})), {
      code: 'unauthenticated',
    });
  });
});

describe('createTBREntryHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      createTBREntryHandler(
        makeRequest(undefined, { bookId: 'book-1', plannedTiles: [] }),
      ),
      { code: 'unauthenticated' },
    );
  });

  test('throws invalid-argument when bookId is missing', async () => {
    await assert.rejects(
      createTBREntryHandler(makeRequest(AUTH, { plannedTiles: [] })),
      { code: 'invalid-argument' },
    );
  });

  test('rejects a planned tile that is not in the catalog', async () => {
    await assert.rejects(
      createTBREntryHandler(
        makeRequest(AUTH, { bookId: 'book-1', plannedTiles: ['not-a-tile'] }),
      ),
      { name: 'DomainError', kind: 'invalid-input' },
    );
  });

  test('rejects notes past the length limit', async () => {
    await assert.rejects(
      createTBREntryHandler(
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

describe('updateTBREntryHandler', () => {
  test('throws invalid-argument when tbrId is missing', async () => {
    await assert.rejects(
      updateTBREntryHandler(makeRequest(AUTH, { plannedTiles: [] })),
      { code: 'invalid-argument' },
    );
  });
});

describe('deleteTBREntryHandler', () => {
  test('throws unauthenticated when request has no auth', async () => {
    await assert.rejects(
      deleteTBREntryHandler(makeRequest(undefined, { tbrId: 'tbr-1' })),
      { code: 'unauthenticated' },
    );
  });
});

describe('promoteTBREntryHandler', () => {
  test('throws invalid-argument when isFreebie is missing', async () => {
    await assert.rejects(
      promoteTBREntryHandler(
        makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1] }),
      ),
      { code: 'invalid-argument' },
    );
  });

  test('throws invalid-argument when tbrId is missing', async () => {
    await assert.rejects(
      promoteTBREntryHandler(
        makeRequest(AUTH, { tiles: [t1], isFreebie: false }),
      ),
      { code: 'invalid-argument' },
    );
  });

  // Promote writes a reading, so it enforces the reading tile rules, not the
  // looser planning ones.
  test('rejects a fourth tile on a non-freebie promotion', async () => {
    await assert.rejects(
      promoteTBREntryHandler(
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

describe('createTBREntryHandler with a fake repository', () => {
  test('returns the id the repository assigned', async () => {
    const result = await createTBREntryHandler(
      makeRequest(AUTH, { bookId: 'book-1', plannedTiles: [t1] }),
      fakeRepo({ create: () => Promise.resolve('tbr-new') }),
    );
    assert.deepEqual(result, { tbrId: 'tbr-new' });
  });

  test('surfaces a book that is not in the catalog', async () => {
    await assert.rejects(
      createTBREntryHandler(
        makeRequest(AUTH, { bookId: 'ghost', plannedTiles: [] }),
        fakeRepo({
          create: () =>
            Promise.reject(
              new DomainError('not-found', 'That book is not in the catalog.'),
            ),
        }),
      ),
      { name: 'DomainError', kind: 'not-found' },
    );
  });
});

describe('updateTBREntryHandler with a fake repository', () => {
  test('passes the entry id and fields through', async () => {
    const calls: unknown[] = [];
    await updateTBREntryHandler(
      makeRequest(AUTH, { tbrId: 'tbr-1', plannedTiles: [t1], notes: 'soon' }),
      fakeRepo({
        update: (uid, tbrId, fields) => {
          calls.push({ uid, tbrId, fields });
          return Promise.resolve();
        },
      }),
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

describe('deleteTBREntryHandler with a fake repository', () => {
  test('removes the entry under the caller uid', async () => {
    const calls: unknown[] = [];
    await deleteTBREntryHandler(
      makeRequest(AUTH, { tbrId: 'tbr-1' }),
      fakeRepo({
        remove: (uid, tbrId) => {
          calls.push({ uid, tbrId });
          return Promise.resolve();
        },
      }),
    );
    assert.deepEqual(calls, [{ uid: 'user-1', tbrId: 'tbr-1' }]);
  });
});

describe('promoteTBREntryHandler with a fake repository', () => {
  test('returns the reading id the promotion produced', async () => {
    const result = await promoteTBREntryHandler(
      makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: false }),
      fakeRepo({
        promote: () =>
          Promise.resolve({
            readingId: 'tbr-1',
            bookId: 'book-1',
            alreadyLogged: false,
          }),
      }),
    );
    assert.deepEqual(result, { readingId: 'tbr-1' });
  });

  // A retry whose first response was lost must report the reading, not a
  // missing entry for a book the user did log.
  test('reports the existing reading when the entry was already promoted', async () => {
    const result = await promoteTBREntryHandler(
      makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: false }),
      fakeRepo({
        promote: () =>
          Promise.resolve({
            readingId: 'tbr-1',
            bookId: 'book-1',
            alreadyLogged: true,
          }),
      }),
    );
    assert.deepEqual(result, { readingId: 'tbr-1' });
  });

  test('surfaces a freebie conflict', async () => {
    await assert.rejects(
      promoteTBREntryHandler(
        makeRequest(AUTH, { tbrId: 'tbr-1', tiles: [t1], isFreebie: true }),
        fakeRepo({
          promote: () =>
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

describe('listMyTBRHandler with a fake repository', () => {
  // A non-empty list reaches attachBooks, which reads Firestore directly.
  test('returns an empty list when the user has no entries', async () => {
    const result = await listMyTBRHandler(
      makeRequest(AUTH, {}),
      fakeRepo({ list: () => Promise.resolve([]) }),
    );
    assert.deepEqual(result, []);
  });
});
