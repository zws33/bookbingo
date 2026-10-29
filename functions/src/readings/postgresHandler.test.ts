import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { MissingBookError } from '../books/errors.js';
import type { Book, BookRepository } from '../books/postgresStore.js';
import {
  CHALLENGE_GONE,
  type Challenge,
  type ChallengeMember,
  type ChallengeRepository,
  type Membership,
} from '../challenges/postgresStore.js';
import type {
  ChallengeStatus,
  MemberRole,
  MembershipStatus,
} from '../challenges/schema.js';
import { DomainError } from '../common/errors.js';
import { readingHandlers } from './postgresHandler.js';
import type { Reading, ReadingRepository } from './postgresStore.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const READING_ID = 'reading-1';

const BOOK_ID = 'a'.repeat(32);

const AUTHOR = 'user-2';

const DENIED = 'You do not have permission to do that in this challenge.';

const READINGS_FROZEN = 'This challenge is not taking readings right now.';

const READING_GONE = 'That reading no longer exists.';

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
  readingHandlers(
    fakeReadingRepo(readings),
    fakeBookRepo(books),
    fakeChallengeRepo(challenges),
  );

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

function makeChallenge(
  status: ChallengeStatus = 'active',
  tagCap = 3,
): Challenge {
  return {
    id: CHALLENGE_ID,
    name: 'Summer Reading',
    status,
    tagCap,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
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
  role: MemberRole,
  status: MembershipStatus = 'active',
  userId = AUTH.uid,
): ChallengeMember {
  return {
    ...makeMembership(role, status, userId),
    name: `name-${userId}`,
    photoURL: null,
  };
}

function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: READING_ID,
    userId: AUTH.uid,
    bookId: BOOK_ID,
    tagIds: ['tag-1'],
    isFreebie: false,
    readAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

const BOOK: Book = {
  id: BOOK_ID,
  title: 'Piranesi',
  author: 'Susanna Clarke',
  thumbnailUrl: null,
};

const membershipOf = (membership: Membership | undefined) => () =>
  Promise.resolve(membership);

const membershipsOf =
  (byUser: Record<string, Membership | undefined>) =>
  (_challengeId: string, userId: string) =>
    Promise.resolve(byUser[userId]);

/** An `active` member of an `active` challenge: writes are permitted. */
const asRole = (role: MemberRole, status: ChallengeStatus = 'active') => ({
  getMembership: membershipOf(makeMembership(role)),
  get: () => Promise.resolve(makeChallenge(status)),
});

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

const CREATE = {
  challengeId: CHALLENGE_ID,
  bookId: BOOK_ID,
  tagIds: ['t'],
  isFreebie: false,
};
const UPDATE = { ...CREATE, readingId: READING_ID };
const DELETE = { challengeId: CHALLENGE_ID, readingId: READING_ID };

const METHODS = [
  {
    name: 'list',
    action: 'load readings',
    data: { challengeId: CHALLENGE_ID, userId: AUTH.uid },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.list(r),
  },
  {
    name: 'leaderboard',
    action: 'load the leaderboard',
    data: { challengeId: CHALLENGE_ID },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.leaderboard(r),
  },
  {
    name: 'create',
    action: 'log a reading',
    data: CREATE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.create(r),
  },
  {
    name: 'update',
    action: 'update a reading',
    data: UPDATE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.update(r),
  },
  {
    name: 'remove',
    action: 'delete a reading',
    data: DELETE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.remove(r),
  },
] as const;

for (const { name, action, data, call } of METHODS) {
  describe(`readingHandlers.${name} access`, () => {
    test('requires a signed-in caller', async () => {
      await assert.rejects(
        call(handlers(), makeRequest(undefined, data)),
        new RegExp(`Must be signed in to ${action}\\.`),
      );
    });

    test('rejects a missing challenge id', async () => {
      await assert.rejects(
        call(handlers(), makeRequest(AUTH, { ...data, challengeId: '' })),
        /Too small: expected string to have >=1 characters/,
      );
    });

    test('tells a non-member the challenge does not exist', async () => {
      await rejectsWith('not-found', CHALLENGE_GONE, () =>
        call(
          handlers({}, { getMembership: membershipOf(undefined) }),
          makeRequest(AUTH, data),
        ),
      );
    });

    for (const status of ['left', 'removed'] as const) {
      test(`tells a ${status} member the same thing, in the same words`, async () => {
        await rejectsWith('not-found', CHALLENGE_GONE, () =>
          call(
            handlers(
              {},
              { getMembership: membershipOf(makeMembership('owner', status)) },
            ),
            makeRequest(AUTH, data),
          ),
        );
      });
    }
  });
}

describe('readingHandlers write lifecycle', () => {
  for (const { name, data, call } of [
    METHODS[2],
    METHODS[3],
    METHODS[4],
  ] as const) {
    for (const status of ['draft', 'complete'] as const) {
      test(`${name} refuses a ${status} challenge`, async () => {
        const error = await rejectsWith('conflict', READINGS_FROZEN, () =>
          call(handlers({}, asRole('member', status)), makeRequest(AUTH, data)),
        );
        assert.equal(error.details.status, status);
      });
    }
  }
});

describe('readingHandlers.list', () => {
  test('returns the readings with their nested book and score', async () => {
    const result = await handlers(
      { list: () => Promise.resolve([makeReading()]) },
      { getMembership: membershipOf(makeMembership('member')) },
      { getByIds: () => Promise.resolve(new Map([[BOOK_ID, BOOK]])) },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTH.uid }));

    assert.equal(result.readings.length, 1);
    assert.deepEqual(result.readings[0]?.book, BOOK);
    assert.deepEqual(result.readings[0]?.tagIds, ['tag-1']);
    assert.equal(result.readings[0]?.readAt, '2026-03-01T00:00:00.000Z');
    assert.equal(result.score.totalBooks, 1);
  });

  test('scores from tag ids, so a tag counts as a tile', async () => {
    const result = await handlers(
      {
        list: () =>
          Promise.resolve([
            makeReading({ tagIds: ['tag-1'] }),
            makeReading({ id: 'r2', tagIds: ['tag-2'] }),
          ]),
      },
      { getMembership: membershipOf(makeMembership('member')) },
      { getByIds: () => Promise.resolve(new Map([[BOOK_ID, BOOK]])) },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTH.uid }));

    assert.deepEqual(result.score.tileCounts, { 'tag-1': 1, 'tag-2': 1 });
  });

  test("hides a left member's readings from another member", async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers(
        {},
        {
          getMembership: membershipsOf({
            [AUTH.uid]: makeMembership('member'),
            [AUTHOR]: makeMembership('member', 'left', AUTHOR),
          }),
        },
      ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTHOR })),
    );
  });

  test('does not re-check the membership when reading your own', async () => {
    const calls: string[] = [];
    await handlers(
      { list: () => Promise.resolve([]) },
      {
        getMembership: (_challengeId, userId) => {
          calls.push(userId);
          return Promise.resolve(makeMembership('member'));
        },
      },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTH.uid }));

    assert.deepEqual(calls, [AUTH.uid]);
  });

  test('logs the missing book ids and rethrows', async () => {
    await assert.rejects(
      handlers(
        { list: () => Promise.resolve([makeReading()]) },
        { getMembership: membershipOf(makeMembership('member')) },
        { getByIds: () => Promise.resolve(new Map()) },
      ).list(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTH.uid }),
      ),
      (error: unknown) =>
        error instanceof MissingBookError && error.bookIds[0] === BOOK_ID,
    );
  });
});

describe('readingHandlers.leaderboard', () => {
  test('scores every active member, highest first', async () => {
    const rows = await handlers(
      {
        listByChallenge: () =>
          Promise.resolve(
            new Map([
              [AUTH.uid, [makeReading({ tagIds: ['tag-1'] })]],
              [
                AUTHOR,
                [
                  makeReading({ id: 'r2', userId: AUTHOR, tagIds: ['tag-1'] }),
                  makeReading({ id: 'r3', userId: AUTHOR, tagIds: ['tag-2'] }),
                ],
              ],
            ]),
          ),
      },
      {
        getMembership: membershipOf(makeMembership('member')),
        listMembers: () =>
          Promise.resolve([
            makeMember('owner'),
            makeMember('member', 'active', AUTHOR),
          ]),
      },
    ).leaderboard(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.deepEqual(
      rows.map((row) => row.userId),
      [AUTHOR, AUTH.uid],
    );
    assert.deepEqual(
      rows.map((row) => row.bookCount),
      [2, 1],
    );
  });

  test('includes a member with no readings at zero', async () => {
    const rows = await handlers(
      { listByChallenge: () => Promise.resolve(new Map()) },
      {
        getMembership: membershipOf(makeMembership('member')),
        listMembers: () => Promise.resolve([makeMember('member')]),
      },
    ).leaderboard(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.deepEqual(rows, [
      {
        userId: AUTH.uid,
        name: `name-${AUTH.uid}`,
        photoURL: null,
        score: 0,
        bookCount: 0,
      },
    ]);
  });

  for (const status of ['left', 'removed'] as const) {
    test(`leaves a ${status} member off the board`, async () => {
      const rows = await handlers(
        { listByChallenge: () => Promise.resolve(new Map()) },
        {
          getMembership: membershipOf(makeMembership('member')),
          listMembers: () =>
            Promise.resolve([
              makeMember('member'),
              makeMember('member', status, AUTHOR),
            ]),
        },
      ).leaderboard(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.deepEqual(
        rows.map((row) => row.userId),
        [AUTH.uid],
      );
    });
  }
});

describe('readingHandlers.create', () => {
  test('passes the challenge, caller and fields through', async () => {
    const calls: unknown[] = [];
    const result = await handlers(
      {
        create: (challengeId, userId, fields) => {
          calls.push([challengeId, userId, fields]);
          return Promise.resolve(READING_ID);
        },
      },
      asRole('member'),
    ).create(makeRequest(AUTH, { ...CREATE, tagIds: ['tag-1', 'tag-2'] }));

    assert.deepEqual(result, { readingId: READING_ID });
    assert.deepEqual(calls, [
      [
        CHALLENGE_ID,
        AUTH.uid,
        { bookId: BOOK_ID, tagIds: ['tag-1', 'tag-2'], isFreebie: false },
      ],
    ]);
  });

  test("enforces the challenge's cap, not a constant", async () => {
    await rejectsWith(
      'invalid-input',
      'A reading can use at most 1 tags unless it is a freebie.',
      () =>
        handlers(
          {},
          {
            getMembership: membershipOf(makeMembership('member')),
            get: () => Promise.resolve(makeChallenge('active', 1)),
          },
        ).create(makeRequest(AUTH, { ...CREATE, tagIds: ['tag-1', 'tag-2'] })),
    );
  });

  test('accepts tags up to the cap', async () => {
    const result = await handlers(
      { create: () => Promise.resolve(READING_ID) },
      {
        getMembership: membershipOf(makeMembership('member')),
        get: () => Promise.resolve(makeChallenge('active', 2)),
      },
    ).create(makeRequest(AUTH, { ...CREATE, tagIds: ['tag-1', 'tag-2'] }));

    assert.deepEqual(result, { readingId: READING_ID });
  });

  test('rejects a duplicate tag', async () => {
    await rejectsWith(
      'invalid-input',
      'A reading cannot use the same tag twice.',
      () =>
        handlers({}, asRole('member')).create(
          makeRequest(AUTH, { ...CREATE, tagIds: ['tag-1', 'tag-1'] }),
        ),
    );
  });

  test('rejects a freebie with no tags', async () => {
    await rejectsWith(
      'invalid-input',
      'A freebie reading must use at least one tag.',
      () =>
        handlers({}, asRole('member')).create(
          makeRequest(AUTH, { ...CREATE, tagIds: [], isFreebie: true }),
        ),
    );
  });

  test('lets a freebie exceed the cap', async () => {
    const result = await handlers(
      { create: () => Promise.resolve(READING_ID) },
      asRole('member'),
    ).create(
      makeRequest(AUTH, {
        ...CREATE,
        tagIds: ['a', 'b', 'c', 'd'],
        isFreebie: true,
      }),
    );

    assert.deepEqual(result, { readingId: READING_ID });
  });

  test('forwards a second freebie as a conflict', async () => {
    const message = 'You already have a freebie reading.';
    await rejectsWith('conflict', message, () =>
      handlers(
        { create: () => Promise.reject(new DomainError('conflict', message)) },
        asRole('member'),
      ).create(makeRequest(AUTH, { ...CREATE, isFreebie: true })),
    );
  });
});

describe('readingHandlers.update rank rules', () => {
  const editsOwn = (role: MemberRole) =>
    handlers(
      {
        get: () => Promise.resolve(makeReading()),
        update: () => Promise.resolve(),
      },
      asRole(role),
    ).update(makeRequest(AUTH, UPDATE));

  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`a ${role} edits their own reading`, async () => {
      await editsOwn(role);
    });
  }

  test('reports an unknown reading as missing', async () => {
    await rejectsWith('not-found', READING_GONE, () =>
      handlers(
        { get: () => Promise.resolve(undefined) },
        asRole('owner'),
      ).update(makeRequest(AUTH, UPDATE)),
    );
  });

  /**
   * Rule 18: strictly lower rank only. The diagonal is denied, which is what
   * stops an admin editing another admin.
   */
  const RANKS = ['owner', 'admin', 'member'] as const;
  const ALLOWED: Record<MemberRole, MemberRole[]> = {
    owner: ['admin', 'member'],
    admin: ['member'],
    member: [],
  };

  for (const actorRole of RANKS) {
    for (const authorRole of RANKS) {
      const permitted = ALLOWED[actorRole].includes(authorRole);
      test(`a ${actorRole} ${permitted ? 'edits' : 'cannot edit'} a ${authorRole}'s reading`, async () => {
        const run = () =>
          handlers(
            {
              get: () => Promise.resolve(makeReading({ userId: AUTHOR })),
              update: () => Promise.resolve(),
            },
            {
              getMembership: membershipsOf({
                [AUTH.uid]: makeMembership(actorRole),
                [AUTHOR]: makeMembership(authorRole, 'active', AUTHOR),
              }),
              get: () => Promise.resolve(makeChallenge()),
            },
          ).update(makeRequest(AUTH, UPDATE));

        if (permitted) {
          await run();
        } else {
          const error = await rejectsWith('forbidden', DENIED, run);
          assert.equal(error.details.permission, 'reading.write.any');
        }
      });
    }
  }

  for (const status of ['left', 'removed'] as const) {
    test(`reports a ${status} author's reading as missing`, async () => {
      await rejectsWith('not-found', READING_GONE, () =>
        handlers(
          { get: () => Promise.resolve(makeReading({ userId: AUTHOR })) },
          {
            getMembership: membershipsOf({
              [AUTH.uid]: makeMembership('owner'),
              [AUTHOR]: makeMembership('member', status, AUTHOR),
            }),
            get: () => Promise.resolve(makeChallenge()),
          },
        ).update(makeRequest(AUTH, UPDATE)),
      );
    });
  }
});

describe('readingHandlers.remove', () => {
  test('deletes your own reading', async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        get: () => Promise.resolve(makeReading()),
        remove: (challengeId, readingId) => {
          calls.push([challengeId, readingId]);
          return Promise.resolve();
        },
      },
      asRole('member'),
    ).remove(makeRequest(AUTH, DELETE));

    assert.deepEqual(calls, [[CHALLENGE_ID, READING_ID]]);
  });

  test("a member cannot delete another member's reading", async () => {
    await rejectsWith('forbidden', DENIED, () =>
      handlers(
        { get: () => Promise.resolve(makeReading({ userId: AUTHOR })) },
        {
          getMembership: membershipsOf({
            [AUTH.uid]: makeMembership('member'),
            [AUTHOR]: makeMembership('member', 'active', AUTHOR),
          }),
          get: () => Promise.resolve(makeChallenge()),
        },
      ).remove(makeRequest(AUTH, DELETE)),
    );
  });

  test('does not validate tags', async () => {
    await handlers(
      {
        get: () => Promise.resolve(makeReading({ tagIds: ['x', 'x'] })),
        remove: () => Promise.resolve(),
      },
      asRole('member'),
    ).remove(makeRequest(AUTH, DELETE));
  });
});
