import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { MissingBookError } from '../books/errors.js';
import type { Book, BookRepository } from '../books/postgresStore.js';
import {
  CHALLENGE_GONE,
  type Challenge,
  type ChallengeRepository,
  type Membership,
} from '../challenges/postgresStore.js';
import type {
  ChallengeStatus,
  MemberRole,
  MembershipStatus,
} from '../challenges/schema.js';
import { DomainError } from '../common/errors.js';
import { tbrHandlers } from './postgresHandler.js';
import type { TBREntry, TBREntryRepository } from './postgresStore.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const TBR_ID = 'tbr-1';

const BOOK_ID = 'a'.repeat(32);

const OTHER = 'user-2';

const READINGS_FROZEN = 'This challenge is not taking readings right now.';

const ENTRY_GONE = 'That reading list entry no longer exists.';

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

function fakeTbrRepo(
  overrides: Partial<TBREntryRepository> = {},
): TBREntryRepository {
  return {
    list: unexpected('list'),
    get: unexpected('get'),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
    promote: unexpected('promote'),
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
  tbr: Partial<TBREntryRepository> = {},
  challenges: Partial<ChallengeRepository> = {},
  books: Partial<BookRepository> = {},
) =>
  tbrHandlers(
    fakeTbrRepo(tbr),
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
): Membership {
  return {
    userId: AUTH.uid,
    role,
    status,
    joinedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function makeEntry(overrides: Partial<TBREntry> = {}): TBREntry {
  return {
    id: TBR_ID,
    userId: AUTH.uid,
    bookId: BOOK_ID,
    plannedTagIds: ['tag-1'],
    addedAt: new Date('2026-02-01T00:00:00.000Z'),
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
  plannedTagIds: ['tag-1'],
};
const UPDATE = {
  challengeId: CHALLENGE_ID,
  tbrId: TBR_ID,
  plannedTagIds: ['tag-1'],
};
const DELETE = { challengeId: CHALLENGE_ID, tbrId: TBR_ID };
const PROMOTE = {
  challengeId: CHALLENGE_ID,
  tbrId: TBR_ID,
  tagIds: ['tag-1'],
  isFreebie: false,
};

const METHODS = [
  {
    name: 'list',
    action: 'load your reading list',
    data: { challengeId: CHALLENGE_ID },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.list(r),
  },
  {
    name: 'create',
    action: 'add to your reading list',
    data: CREATE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.create(r),
  },
  {
    name: 'update',
    action: 'update your reading list',
    data: UPDATE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.update(r),
  },
  {
    name: 'remove',
    action: 'update your reading list',
    data: DELETE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.remove(r),
  },
  {
    name: 'promote',
    action: 'log a reading',
    data: PROMOTE,
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.promote(r),
  },
] as const;

for (const { name, action, data, call } of METHODS) {
  describe(`tbrHandlers.${name} access`, () => {
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

describe('tbrHandlers lifecycle', () => {
  // The challenge repository's `get` rejects unless overridden, so a handler
  // that consulted the lifecycle would fail here rather than pass.
  for (const { name, data, call } of [
    METHODS[1],
    METHODS[2],
    METHODS[3],
  ] as const) {
    test(`${name} never reads the challenge status`, async () => {
      await call(
        handlers(
          {
            get: () => Promise.resolve(makeEntry()),
            create: () => Promise.resolve(TBR_ID),
            update: () => Promise.resolve(),
            remove: () => Promise.resolve(),
          },
          { getMembership: membershipOf(makeMembership('member')) },
        ),
        makeRequest(AUTH, data),
      );
    });
  }

  for (const status of ['draft', 'complete'] as const) {
    test(`promote refuses a ${status} challenge`, async () => {
      const error = await rejectsWith('conflict', READINGS_FROZEN, () =>
        handlers({}, asRole('member', status)).promote(
          makeRequest(AUTH, PROMOTE),
        ),
      );
      assert.equal(error.details.status, status);
    });
  }
});

describe('tbrHandlers.list', () => {
  test("returns the caller's entries with their nested book", async () => {
    const calls: unknown[] = [];
    const entries = await handlers(
      {
        list: (challengeId, userId) => {
          calls.push([challengeId, userId]);
          return Promise.resolve([makeEntry({ notes: 'for book club' })]);
        },
      },
      { getMembership: membershipOf(makeMembership('member')) },
      { getByIds: () => Promise.resolve(new Map([[BOOK_ID, BOOK]])) },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.deepEqual(calls, [[CHALLENGE_ID, AUTH.uid]]);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0]?.book, BOOK);
    assert.deepEqual(entries[0]?.plannedTagIds, ['tag-1']);
    assert.equal(entries[0]?.notes, 'for book club');
    assert.equal(entries[0]?.addedAt, '2026-02-01T00:00:00.000Z');
  });

  test('omits notes and updatedAt when unset', async () => {
    const entries = await handlers(
      { list: () => Promise.resolve([makeEntry()]) },
      { getMembership: membershipOf(makeMembership('member')) },
      { getByIds: () => Promise.resolve(new Map([[BOOK_ID, BOOK]])) },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.ok(entries[0]);
    assert.equal('notes' in entries[0], false);
    assert.equal('updatedAt' in entries[0], false);
  });

  test('logs the missing book ids and rethrows', async () => {
    await assert.rejects(
      handlers(
        { list: () => Promise.resolve([makeEntry()]) },
        { getMembership: membershipOf(makeMembership('member')) },
        { getByIds: () => Promise.resolve(new Map()) },
      ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
      (error: unknown) =>
        error instanceof MissingBookError && error.bookIds[0] === BOOK_ID,
    );
  });
});

describe('tbrHandlers.create', () => {
  test('passes the challenge, caller and fields through', async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        create: (challengeId, userId, fields) => {
          calls.push([challengeId, userId, fields]);
          return Promise.resolve(TBR_ID);
        },
      },
      { getMembership: membershipOf(makeMembership('member')) },
    ).create(
      makeRequest(AUTH, {
        ...CREATE,
        plannedTagIds: ['tag-1', 'tag-2'],
        notes: '  later  ',
      }),
    );

    assert.deepEqual(calls, [
      [
        CHALLENGE_ID,
        AUTH.uid,
        {
          bookId: BOOK_ID,
          plannedTagIds: ['tag-1', 'tag-2'],
          notes: 'later',
        },
      ],
    ]);
  });

  test('accepts more planned tags than the cap', async () => {
    const result = await handlers(
      { create: () => Promise.resolve(TBR_ID) },
      { getMembership: membershipOf(makeMembership('member')) },
    ).create(
      makeRequest(AUTH, {
        ...CREATE,
        plannedTagIds: ['a', 'b', 'c', 'd', 'e'],
      }),
    );

    assert.deepEqual(result, { tbrId: TBR_ID });
  });

  test('rejects a duplicate planned tag', async () => {
    await rejectsWith(
      'invalid-input',
      'A tag list cannot use the same tag twice.',
      () =>
        handlers(
          {},
          { getMembership: membershipOf(makeMembership('member')) },
        ).create(
          makeRequest(AUTH, { ...CREATE, plannedTagIds: ['tag-1', 'tag-1'] }),
        ),
    );
  });

  test('rejects notes over 2000 characters', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, { ...CREATE, notes: 'x'.repeat(2001) }),
      ),
      /Too big: expected string to have <=2000 characters/,
    );
  });
});

describe('tbrHandlers ownership', () => {
  for (const { name, data, call } of [METHODS[2], METHODS[3]] as const) {
    test(`${name} reports another member's entry as missing`, async () => {
      await rejectsWith('not-found', ENTRY_GONE, () =>
        call(
          handlers(
            { get: () => Promise.resolve(makeEntry({ userId: OTHER })) },
            { getMembership: membershipOf(makeMembership('owner')) },
          ),
          makeRequest(AUTH, data),
        ),
      );
    });

    test(`${name} reports an unknown entry as missing`, async () => {
      await rejectsWith('not-found', ENTRY_GONE, () =>
        call(
          handlers(
            { get: () => Promise.resolve(undefined) },
            { getMembership: membershipOf(makeMembership('member')) },
          ),
          makeRequest(AUTH, data),
        ),
      );
    });
  }

  test("update writes the caller's own entry", async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        get: () => Promise.resolve(makeEntry()),
        update: (challengeId, tbrId, fields) => {
          calls.push([challengeId, tbrId, fields]);
          return Promise.resolve();
        },
      },
      { getMembership: membershipOf(makeMembership('member')) },
    ).update(makeRequest(AUTH, { ...UPDATE, notes: 'soon' }));

    assert.deepEqual(calls, [
      [CHALLENGE_ID, TBR_ID, { plannedTagIds: ['tag-1'], notes: 'soon' }],
    ]);
  });

  test("remove deletes the caller's own entry", async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        get: () => Promise.resolve(makeEntry()),
        remove: (challengeId, tbrId) => {
          calls.push([challengeId, tbrId]);
          return Promise.resolve();
        },
      },
      { getMembership: membershipOf(makeMembership('member')) },
    ).remove(makeRequest(AUTH, DELETE));

    assert.deepEqual(calls, [[CHALLENGE_ID, TBR_ID]]);
  });
});

describe('tbrHandlers.promote', () => {
  test('passes the promotion request through and returns the reading id', async () => {
    const calls: unknown[] = [];
    const result = await handlers(
      {
        promote: (promotion) => {
          calls.push(promotion);
          return Promise.resolve({
            readingId: TBR_ID,
            bookId: BOOK_ID,
            alreadyLogged: false,
          });
        },
      },
      asRole('member'),
    ).promote(makeRequest(AUTH, PROMOTE));

    assert.deepEqual(result, { readingId: TBR_ID });
    assert.deepEqual(calls, [
      {
        challengeId: CHALLENGE_ID,
        userId: AUTH.uid,
        tbrId: TBR_ID,
        tagIds: ['tag-1'],
        isFreebie: false,
      },
    ]);
  });

  test('enforces the challenge cap, unlike a plan', async () => {
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
        ).promote(
          makeRequest(AUTH, { ...PROMOTE, tagIds: ['tag-1', 'tag-2'] }),
        ),
    );
  });

  test('rejects a freebie with no tags', async () => {
    await rejectsWith(
      'invalid-input',
      'A freebie reading must use at least one tag.',
      () =>
        handlers({}, asRole('member')).promote(
          makeRequest(AUTH, { ...PROMOTE, tagIds: [], isFreebie: true }),
        ),
    );
  });

  test('reports an already-promoted entry as logged, not an error', async () => {
    const result = await handlers(
      {
        promote: () =>
          Promise.resolve({
            readingId: TBR_ID,
            bookId: BOOK_ID,
            alreadyLogged: true,
          }),
      },
      asRole('member'),
    ).promote(makeRequest(AUTH, PROMOTE));

    assert.deepEqual(result, { readingId: TBR_ID });
  });
});
