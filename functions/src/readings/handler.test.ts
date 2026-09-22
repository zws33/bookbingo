import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  createReadingHandler,
  deleteReadingHandler,
  listReadingsHandler,
  updateReadingHandler,
} from './handler.js';
import { toReading } from './store.js';
import { TILES } from '../domain/constants.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };
const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);
const READ_AT = new Date('2026-01-02T03:04:05.000Z');

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

function makeDoc(id: string, data: unknown): QueryDocumentSnapshot {
  return {
    id,
    ref: { path: `users/user-1/readings/${id}` },
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

const timestamp = (date: Date) => ({ toDate: () => date });

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

describe('toReading', () => {
  test('encodes instants as ISO strings', () => {
    const reading = toReading(
      makeDoc('r1', {
        bookId: 'book-1',
        tiles: [t1],
        isFreebie: false,
        readAt: timestamp(READ_AT),
        createdAt: timestamp(READ_AT),
      }),
    );
    assert.equal(reading.readAt, '2026-01-02T03:04:05.000Z');
    assert.equal(reading.updatedAt, undefined);
  });

  // 49 of prod's 104 readings still carry bookTitle/bookAuthor from the
  // pre-bookId era. Every one of them resolves through bookId, so the stored
  // copies are ignored and the book document is the only source of a title.
  test('ignores the stale denormalized title and author', () => {
    const reading = toReading(
      makeDoc('r1', {
        bookId: 'book-1',
        bookTitle: 'Stale Title',
        bookAuthor: 'Stale Author',
        tiles: [],
        isFreebie: false,
        readAt: timestamp(READ_AT),
        createdAt: timestamp(READ_AT),
      }),
    );
    assert.deepEqual(Object.keys(reading).sort(), [
      'bookId',
      'createdAt',
      'id',
      'isFreebie',
      'readAt',
      'tiles',
    ]);
  });
});
