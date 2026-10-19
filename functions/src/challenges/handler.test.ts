import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { challengeHandlers } from './handler.js';
import { DomainError } from '../common/errors.js';
import {
  CHALLENGE_GONE,
  type Challenge,
  type ChallengeRepository,
  type Membership,
} from './postgresStore.js';
import type { MemberRole, MembershipStatus } from './schema.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const DENIED = 'You do not have permission to do that in this challenge.';

const RENAME_LOCKED = 'A complete challenge cannot be renamed.';

const CAP_LOCKED =
  'The tag cap cannot change once the challenge has started, because scores already depend on it.';

function fakeRepo(
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
    listMyChallenges: unexpected('listMyChallenges'),
    upsertMembership: unexpected('upsertMembership'),
    listActiveOwners: unexpected('listActiveOwners'),
    findByJoinCode: unexpected('findByJoinCode'),
    getJoinCode: unexpected('getJoinCode'),
    rotateJoinCode: unexpected('rotateJoinCode'),
    ...overrides,
  };
}

const handlers = (overrides: Partial<ChallengeRepository> = {}) =>
  challengeHandlers(fakeRepo(overrides));

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

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: CHALLENGE_ID,
    name: 'Summer Reading',
    status: 'active',
    tagCap: 3,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
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

const membershipOf = (membership: Membership | undefined) => () =>
  Promise.resolve(membership);

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

describe('challengeHandlers.create', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().create(makeRequest(undefined, { name: 'A', tagCap: 3 })),
      /Must be signed in to create a challenge\./,
    );
  });

  test('rejects a missing name', async () => {
    await assert.rejects(
      handlers().create(makeRequest(AUTH, { tagCap: 3 })),
      /expected string, received undefined/,
    );
  });

  test('rejects a non-positive tag cap', async () => {
    await assert.rejects(
      handlers().create(makeRequest(AUTH, { name: 'A', tagCap: 0 })),
      /expected number to be >0/,
    );
  });

  test('returns the new id and join code, with no permission check', async () => {
    const result = await handlers({
      create: () =>
        Promise.resolve({ challengeId: CHALLENGE_ID, joinCode: 'ABCD23' }),
    }).create(makeRequest(AUTH, { name: 'Summer Reading', tagCap: 3 }));

    assert.deepEqual(result, {
      challengeId: CHALLENGE_ID,
      joinCode: 'ABCD23',
    });
  });

  test('passes the trimmed name and the caller as the creator', async () => {
    const calls: unknown[] = [];
    await handlers({
      create: (userId, fields) => {
        calls.push([userId, fields]);
        return Promise.resolve({
          challengeId: CHALLENGE_ID,
          joinCode: 'ABCD23',
        });
      },
    }).create(makeRequest(AUTH, { name: '  Summer Reading  ', tagCap: 3 }));

    assert.deepEqual(calls, [
      ['user-1', { name: 'Summer Reading', tagCap: 3 }],
    ]);
  });
});

describe('challengeHandlers.get', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().get(makeRequest(undefined, { challengeId: CHALLENGE_ID })),
      /Must be signed in to load a challenge\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).get(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID }),
      ),
    );
  });

  for (const status of ['left', 'removed'] as const) {
    test(`tells a ${status} member the same thing, in the same words`, async () => {
      await rejectsWith('not-found', CHALLENGE_GONE, () =>
        handlers({
          getMembership: membershipOf(makeMembership('owner', status)),
        }).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
      );
    });
  }

  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`a ${role} reads the challenge and its roster`, async () => {
      const result = await handlers({
        getMembership: membershipOf(makeMembership(role)),
        get: () => Promise.resolve(makeChallenge()),
        listMembers: () => Promise.resolve([makeMembership(role)]),
      }).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.equal(result.challenge.id, CHALLENGE_ID);
      assert.equal(result.challenge.createdAt, '2026-01-01T00:00:00.000Z');
      assert.deepEqual(result.members, [
        {
          userId: 'user-1',
          role,
          status: 'active',
          joinedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
    });
  }

  test('leaves left and removed members out of the roster', async () => {
    const result = await handlers({
      getMembership: membershipOf(makeMembership('member')),
      get: () => Promise.resolve(makeChallenge()),
      listMembers: () =>
        Promise.resolve([
          makeMembership('member'),
          makeMembership('member', 'left', 'user-2'),
          makeMembership('admin', 'removed', 'user-3'),
        ]),
    }).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

    assert.deepEqual(
      result.members.map((member) => member.userId),
      ['user-1'],
    );
  });
});

describe('challengeHandlers.updateConfig', () => {
  const request = (data: Record<string, unknown>) =>
    makeRequest(AUTH, { challengeId: CHALLENGE_ID, ...data });

  test('rejects a payload that changes nothing', async () => {
    await assert.rejects(
      handlers().updateConfig(request({})),
      /Provide a name or a tag cap to change\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).updateConfig(
        request({ name: 'Renamed' }),
      ),
    );
  });

  test('forbids a member, who is inside the challenge but lacks config.edit', async () => {
    const error = await rejectsWith('forbidden', DENIED, () =>
      handlers({
        getMembership: membershipOf(makeMembership('member')),
      }).updateConfig(request({ name: 'Renamed' })),
    );
    assert.deepEqual(error.details, {
      permission: 'config.edit',
      role: 'member',
    });
  });

  for (const role of ['owner', 'admin'] as const) {
    test(`a ${role} renames an active challenge`, async () => {
      const calls: unknown[] = [];
      await handlers({
        getMembership: membershipOf(makeMembership(role)),
        get: () => Promise.resolve(makeChallenge({ status: 'active' })),
        update: (challengeId, fields) => {
          calls.push([challengeId, fields]);
          return Promise.resolve();
        },
      }).updateConfig(request({ name: 'Renamed' }));

      assert.deepEqual(calls, [
        [CHALLENGE_ID, { name: 'Renamed', tagCap: undefined }],
      ]);
    });
  }

  test('an active challenge takes a rename but not a cap change', async () => {
    const renameOnly = {
      getMembership: membershipOf(makeMembership('owner')),
      get: () => Promise.resolve(makeChallenge({ status: 'active' })),
      update: () => Promise.resolve(),
    };

    await handlers(renameOnly).updateConfig(request({ name: 'Renamed' }));

    const error = await rejectsWith('conflict', CAP_LOCKED, () =>
      handlers(renameOnly).updateConfig(request({ tagCap: 5 })),
    );
    assert.deepEqual(error.details, { status: 'active' });
  });

  test('a draft takes both', async () => {
    const calls: unknown[] = [];
    await handlers({
      getMembership: membershipOf(makeMembership('owner')),
      get: () => Promise.resolve(makeChallenge({ status: 'draft' })),
      update: (_challengeId, fields) => {
        calls.push(fields);
        return Promise.resolve();
      },
    }).updateConfig(request({ name: 'Renamed', tagCap: 5 }));

    assert.deepEqual(calls, [{ name: 'Renamed', tagCap: 5 }]);
  });

  test('a complete challenge takes neither, and says which half failed', async () => {
    const complete = {
      getMembership: membershipOf(makeMembership('owner')),
      get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
    };

    await rejectsWith('conflict', RENAME_LOCKED, () =>
      handlers(complete).updateConfig(request({ name: 'Renamed' })),
    );
    await rejectsWith('conflict', CAP_LOCKED, () =>
      handlers(complete).updateConfig(request({ tagCap: 5 })),
    );
  });

  test('rejects the whole payload when only the cap half is locked', async () => {
    await rejectsWith('conflict', CAP_LOCKED, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge({ status: 'active' })),
      }).updateConfig(request({ name: 'Renamed', tagCap: 5 })),
    );
  });
});
