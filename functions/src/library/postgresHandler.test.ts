import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { MissingBookError } from '../books/errors.js';
import type { Book, BookRepository } from '../books/postgresStore.js';
import {
  CHALLENGE_GONE,
  type ChallengeMember,
  type ChallengeRepository,
  type Membership,
} from '../challenges/postgresStore.js';
import type { MemberRole, MembershipStatus } from '../challenges/schema.js';
import { DomainError } from '../common/errors.js';
import type { Reading, ReadingRepository } from '../readings/postgresStore.js';
import { libraryHandlers } from './postgresHandler.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const OTHER = 'user-2';

const PIRANESI = 'a'.repeat(32);

const ANATHEM = 'b'.repeat(32);

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

function fakeReadingRepo(
  overrides: Partial<ReadingRepository> = {},
): ReadingRepository {
  return {
    list: unexpected('list'),
    listByChallenge: unexpected('listByChallenge'),
    get: unexpected('get'),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
    ...overrides,
  };
}

function fakeBookRepo(overrides: Partial<BookRepository> = {}): BookRepository {
  return {
    getByIds: unexpected('getByIds'),
    findByExternalRef: unexpected('findByExternalRef'),
    createIfAbsent: unexpected('createIfAbsent'),
    ...overrides,
  };
}

function fakeChallengeRepo(
  overrides: Partial<ChallengeRepository> = {},
): ChallengeRepository {
  return {
    get: unexpected('get'),
    create: unexpected('create'),
    update: unexpected('update'),
    setStatus: unexpected('setStatus'),
    remove: unexpected('remove'),
    getMembership: unexpected('getMembership'),
    listMembers: unexpected('listMembers'),
    listActiveMemberships: unexpected('listActiveMemberships'),
    getChallengesByUserId: unexpected('getChallengesByUserId'),
    upsertMembership: unexpected('upsertMembership'),
    listActiveOwners: unexpected('listActiveOwners'),
    leave: unexpected('leave'),
    setRole: unexpected('setRole'),
    findByJoinCode: unexpected('findByJoinCode'),
    getJoinCode: unexpected('getJoinCode'),
    rotateJoinCode: unexpected('rotateJoinCode'),
    ...overrides,
  };
}

const handlers = (
  readings: Partial<ReadingRepository> = {},
  challenges: Partial<ChallengeRepository> = {},
  books: Partial<BookRepository> = {},
) =>
  libraryHandlers(
    fakeReadingRepo(readings),
    fakeBookRepo(books),
    fakeChallengeRepo(challenges),
  );

function makeRequest(
  auth: typeof AUTH | undefined,
  data: unknown = { challengeId: CHALLENGE_ID },
): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

function makeMembership(
  role: MemberRole,
  status: MembershipStatus = 'active',
  userId = AUTH.uid,
): Membership {
  return {
    userId,
    role,
    status,
    joinedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function makeMember(
  userId = AUTH.uid,
  name = `name-${userId}`,
): ChallengeMember {
  return {
    ...makeMembership('member', 'active', userId),
    name,
    photoURL: null,
  };
}

function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'reading-1',
    userId: AUTH.uid,
    bookId: PIRANESI,
    tagIds: ['tag-1'],
    isFreebie: false,
    readAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

const book = (id: string, title: string): Book => ({
  id,
  title,
  author: 'Someone',
  thumbnailUrl: null,
});

const membershipOf = (membership: Membership | undefined) => () =>
  Promise.resolve(membership);

const asMember = {
  getMembership: membershipOf(makeMembership('member')),
};

async function rejectsWith(
  kind: string,
  message: string,
  run: () => Promise<unknown>,
): Promise<DomainError> {
  const error = await run().then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  assert.ok(
    error instanceof DomainError,
    `expected a DomainError, got ${String(error)}`,
  );
  assert.equal(error.kind, kind);
  assert.equal(error.message, message);
  return error;
}

describe('libraryHandlers.get access', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().get(makeRequest(undefined)),
      /Must be signed in to load the library\./,
    );
  });

  test('rejects a missing challenge id', async () => {
    await assert.rejects(
      handlers().get(makeRequest(AUTH, {})),
      /expected string, received undefined/,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({}, { getMembership: membershipOf(undefined) }).get(
        makeRequest(AUTH),
      ),
    );
  });

  for (const status of ['left', 'removed'] as const) {
    test(`tells a ${status} member the same thing, in the same words`, async () => {
      await rejectsWith('not-found', CHALLENGE_GONE, () =>
        handlers(
          {},
          { getMembership: membershipOf(makeMembership('owner', status)) },
        ).get(makeRequest(AUTH)),
      );
    });
  }

  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`a ${role} reads the library`, async () => {
      const books = await handlers(
        { listByChallenge: () => Promise.resolve(new Map()) },
        {
          getMembership: membershipOf(makeMembership(role)),
          listMembers: () => Promise.resolve([]),
        },
        { getByIds: () => Promise.resolve(new Map()) },
      ).get(makeRequest(AUTH));

      assert.deepEqual(books, []);
    });
  }
});

describe('libraryHandlers.get aggregation', () => {
  test('groups readers and tags under one book', async () => {
    const books = await handlers(
      {
        listByChallenge: () =>
          Promise.resolve(
            new Map([
              [AUTH.uid, [makeReading({ tagIds: ['tag-1'] })]],
              [
                OTHER,
                [
                  makeReading({
                    id: 'r2',
                    userId: OTHER,
                    tagIds: ['tag-2', 'tag-1'],
                  }),
                ],
              ],
            ]),
          ),
      },
      {
        ...asMember,
        listMembers: () =>
          Promise.resolve([makeMember(), makeMember(OTHER, 'Bea')]),
      },
      {
        getByIds: () =>
          Promise.resolve(new Map([[PIRANESI, book(PIRANESI, 'Piranesi')]])),
      },
    ).get(makeRequest(AUTH));

    assert.equal(books.length, 1);
    assert.equal(books[0]?.readCount, 2);
    assert.deepEqual(books[0]?.uniqueTagIds.sort(), ['tag-1', 'tag-2']);
    assert.deepEqual(books[0]?.readers, [
      {
        userId: AUTH.uid,
        name: `name-${AUTH.uid}`,
        photoURL: null,
        tagIds: ['tag-1'],
      },
      {
        userId: OTHER,
        name: 'Bea',
        photoURL: null,
        tagIds: ['tag-2', 'tag-1'],
      },
    ]);
  });

  test('sorts by title', async () => {
    const books = await handlers(
      {
        listByChallenge: () =>
          Promise.resolve(
            new Map([
              [
                AUTH.uid,
                [
                  makeReading({ bookId: PIRANESI }),
                  makeReading({ id: 'r2', bookId: ANATHEM }),
                ],
              ],
            ]),
          ),
      },
      { ...asMember, listMembers: () => Promise.resolve([makeMember()]) },
      {
        getByIds: () =>
          Promise.resolve(
            new Map([
              [PIRANESI, book(PIRANESI, 'Piranesi')],
              [ANATHEM, book(ANATHEM, 'Anathem')],
            ]),
          ),
      },
    ).get(makeRequest(AUTH));

    assert.deepEqual(
      books.map((entry) => entry.book.title),
      ['Anathem', 'Piranesi'],
    );
  });

  test('returns the nested postgres book, with no metadata', async () => {
    const books = await handlers(
      {
        listByChallenge: () =>
          Promise.resolve(new Map([[AUTH.uid, [makeReading()]]])),
      },
      { ...asMember, listMembers: () => Promise.resolve([makeMember()]) },
      {
        getByIds: () =>
          Promise.resolve(new Map([[PIRANESI, book(PIRANESI, 'Piranesi')]])),
      },
    ).get(makeRequest(AUTH));

    assert.deepEqual(books[0]?.book, {
      id: PIRANESI,
      title: 'Piranesi',
      author: 'Someone',
      thumbnailUrl: null,
    });
  });

  test('reports a reader with no membership row as corrupt', async () => {
    const error = await rejectsWith(
      'corrupt',
      'Reading author has no membership row.',
      () =>
        handlers(
          {
            listByChallenge: () =>
              Promise.resolve(
                new Map([[OTHER, [makeReading({ userId: OTHER })]]]),
              ),
          },
          { ...asMember, listMembers: () => Promise.resolve([makeMember()]) },
        ).get(makeRequest(AUTH)),
    );

    assert.equal(error.details.userId, OTHER);
  });

  test('logs the missing book ids and rethrows', async () => {
    await assert.rejects(
      handlers(
        {
          listByChallenge: () =>
            Promise.resolve(new Map([[AUTH.uid, [makeReading()]]])),
        },
        { ...asMember, listMembers: () => Promise.resolve([makeMember()]) },
        { getByIds: () => Promise.resolve(new Map()) },
      ).get(makeRequest(AUTH)),
      (error: unknown) =>
        error instanceof MissingBookError && error.bookIds[0] === PIRANESI,
    );
  });
});
