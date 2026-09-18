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
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

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
      { code: 'invalid-argument' },
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
        makeRequest(AUTH, { tbrId: 'tbr-1', bookId: 'book-1', tiles: [t1] }),
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
          bookId: 'book-1',
          tiles: [t1, t2, t3, t4],
          isFreebie: false,
        }),
      ),
      { code: 'invalid-argument' },
    );
  });
});
