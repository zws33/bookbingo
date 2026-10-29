import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
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
import { tagHandlers } from './handler.js';
import type { TagRepository } from './postgresStore.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const TAG_ID = 'tag-1';

const DENIED = 'You do not have permission to do that in this challenge.';

const VOCABULARY_LOCKED =
  'The tag set cannot change once the challenge has started, because scores already depend on it.';

function fakeTagRepo(overrides: Partial<TagRepository> = {}): TagRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
  return {
    listByChallenge: unexpected('listByChallenge'),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
    ...overrides,
  };
}

function fakeChallengeRepo(
  overrides: Partial<ChallengeRepository> = {},
): ChallengeRepository {
  const unexpected = (name: string) => () =>
    Promise.reject(new Error(`unexpected ${name} call`));
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
  tags: Partial<TagRepository> = {},
  challenges: Partial<ChallengeRepository> = {},
) => tagHandlers(fakeTagRepo(tags), fakeChallengeRepo(challenges));

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

function makeChallenge(status: ChallengeStatus = 'draft'): Challenge {
  return {
    id: CHALLENGE_ID,
    name: 'Summer Reading',
    status,
    tagCap: 3,
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

const membershipOf = (membership: Membership | undefined) => () =>
  Promise.resolve(membership);

/** An `active` member of a `draft` challenge: writable by anyone with the role. */
const asRole = (role: MemberRole, status: ChallengeStatus = 'draft') => ({
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

/**
 * The membership checks are identical across all four methods, so they are
 * driven from one table rather than restated per method.
 */
const METHODS = [
  {
    name: 'list',
    action: 'load the tags',
    data: { challengeId: CHALLENGE_ID },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.list(r),
  },
  {
    name: 'create',
    action: 'add a tag',
    data: { challengeId: CHALLENGE_ID, label: 'Mystery' },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.create(r),
  },
  {
    name: 'update',
    action: 'rename a tag',
    data: { challengeId: CHALLENGE_ID, tagId: TAG_ID, label: 'Mystery' },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.update(r),
  },
  {
    name: 'remove',
    action: 'delete a tag',
    data: { challengeId: CHALLENGE_ID, tagId: TAG_ID },
    call: (h: ReturnType<typeof handlers>, r: CallableRequest<unknown>) =>
      h.remove(r),
  },
] as const;

for (const { name, action, data, call } of METHODS) {
  describe(`tagHandlers.${name} access`, () => {
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
              {
                getMembership: membershipOf(makeMembership('owner', status)),
              },
            ),
            makeRequest(AUTH, data),
          ),
        );
      });
    }
  });
}

describe('tagHandlers write permissions', () => {
  for (const { name, data, call } of METHODS.filter((m) => m.name !== 'list')) {
    test(`${name} refuses a member`, async () => {
      const error = await rejectsWith('forbidden', DENIED, () =>
        call(handlers({}, asRole('member')), makeRequest(AUTH, data)),
      );
      assert.equal(error.details.role, 'member');
    });

    test(`${name} names the permission it wanted`, async () => {
      const error = await rejectsWith('forbidden', DENIED, () =>
        call(handlers({}, asRole('member')), makeRequest(AUTH, data)),
      );
      assert.equal(
        error.details.permission,
        name === 'remove' ? 'tag.delete' : 'tag.write',
      );
    });

    test(`${name} checks the permission before reading the status`, async () => {
      await rejectsWith('forbidden', DENIED, () =>
        call(
          handlers(
            {},
            { getMembership: membershipOf(makeMembership('member')) },
          ),
          makeRequest(AUTH, data),
        ),
      );
    });

    for (const status of ['active', 'complete'] as const) {
      test(`${name} refuses an ${status} challenge`, async () => {
        const error = await rejectsWith('conflict', VOCABULARY_LOCKED, () =>
          call(handlers({}, asRole('admin', status)), makeRequest(AUTH, data)),
        );
        assert.equal(error.details.status, status);
      });
    }
  }
});

describe('tagHandlers.list', () => {
  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`a ${role} reads the vocabulary`, async () => {
      const result = await handlers(
        {
          listByChallenge: () =>
            Promise.resolve([{ id: TAG_ID, label: 'Mystery' }]),
        },
        { getMembership: membershipOf(makeMembership(role)) },
      ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.deepEqual(result, { tags: [{ id: TAG_ID, label: 'Mystery' }] });
    });
  }

  test('does not read the challenge status', async () => {
    const result = await handlers(
      { listByChallenge: () => Promise.resolve([]) },
      { getMembership: membershipOf(makeMembership('member')) },
    ).list(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.deepEqual(result, { tags: [] });
  });
});

describe('tagHandlers.create', () => {
  test('rejects a blank label', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID, label: '   ' }),
      ),
      /Too small: expected string to have >=1 characters/,
    );
  });

  test('rejects a label over 100 characters', async () => {
    await assert.rejects(
      handlers().create(
        makeRequest(AUTH, {
          challengeId: CHALLENGE_ID,
          label: 'x'.repeat(101),
        }),
      ),
      /Too big: expected string to have <=100 characters/,
    );
  });

  for (const role of ['owner', 'admin'] as const) {
    test(`an ${role} creates a tag and gets its id`, async () => {
      const calls: unknown[] = [];
      const result = await handlers(
        {
          create: (challengeId, label) => {
            calls.push([challengeId, label]);
            return Promise.resolve(TAG_ID);
          },
        },
        asRole(role),
      ).create(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID, label: '  Mystery  ' }),
      );

      assert.deepEqual(result, { tagId: TAG_ID });
      assert.deepEqual(calls, [[CHALLENGE_ID, 'Mystery']]);
    });
  }

  test('forwards a duplicate label as a conflict', async () => {
    await rejectsWith(
      'conflict',
      'That tag already exists in this challenge.',
      () =>
        handlers(
          {
            create: () =>
              Promise.reject(
                new DomainError(
                  'conflict',
                  'That tag already exists in this challenge.',
                ),
              ),
          },
          asRole('admin'),
        ).create(
          makeRequest(AUTH, { challengeId: CHALLENGE_ID, label: 'Mystery' }),
        ),
    );
  });
});

describe('tagHandlers.update', () => {
  test('passes the challenge, tag and trimmed label through', async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        update: (challengeId, tagId, label) => {
          calls.push([challengeId, tagId, label]);
          return Promise.resolve();
        },
      },
      asRole('admin'),
    ).update(
      makeRequest(AUTH, {
        challengeId: CHALLENGE_ID,
        tagId: TAG_ID,
        label: '  Thriller  ',
      }),
    );

    assert.deepEqual(calls, [[CHALLENGE_ID, TAG_ID, 'Thriller']]);
  });

  test('forwards an unknown tag as not-found', async () => {
    await rejectsWith('not-found', 'That tag no longer exists.', () =>
      handlers(
        {
          update: () =>
            Promise.reject(
              new DomainError('not-found', 'That tag no longer exists.'),
            ),
        },
        asRole('admin'),
      ).update(
        makeRequest(AUTH, {
          challengeId: CHALLENGE_ID,
          tagId: TAG_ID,
          label: 'Thriller',
        }),
      ),
    );
  });
});

describe('tagHandlers.remove', () => {
  test('passes the challenge and tag through', async () => {
    const calls: unknown[] = [];
    await handlers(
      {
        remove: (challengeId, tagId) => {
          calls.push([challengeId, tagId]);
          return Promise.resolve();
        },
      },
      asRole('admin'),
    ).remove(makeRequest(AUTH, { challengeId: CHALLENGE_ID, tagId: TAG_ID }));

    assert.deepEqual(calls, [[CHALLENGE_ID, TAG_ID]]);
  });

  test('forwards a tag with readings as a conflict', async () => {
    const message =
      'That tag cannot be deleted while readings are logged against it.';
    await rejectsWith('conflict', message, () =>
      handlers(
        { remove: () => Promise.reject(new DomainError('conflict', message)) },
        asRole('admin'),
      ).remove(makeRequest(AUTH, { challengeId: CHALLENGE_ID, tagId: TAG_ID })),
    );
  });
});
