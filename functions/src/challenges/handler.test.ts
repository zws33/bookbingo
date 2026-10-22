import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { challengeHandlers } from './handler.js';
import { DomainError } from '../common/errors.js';
import {
  CHALLENGE_GONE,
  type Challenge,
  type ChallengeMember,
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

const JOIN_CODE = 'ABCD2345';

const CODE_UNKNOWN = 'That join code does not match a challenge.';

const JOIN_CLOSED = 'That challenge is complete and is not taking new members.';

const REJOIN_DENIED = 'You cannot rejoin a challenge you were removed from.';

const MEMBERSHIP_FROZEN = 'A complete challenge cannot be left.';

const LAST_OWNER =
  'The last owner cannot leave. Promote another owner first, then leave.';

const LAST_OWNER_ROLE =
  'The last owner cannot step down. Promote another owner first.';

const MEMBERS_FROZEN =
  'Membership in a complete challenge can no longer change.';

const MEMBER_GONE = 'That member is not in this challenge.';

const TARGET = 'user-2';

const TRANSITION_DENIED =
  'A challenge moves from draft to active to complete, one step at a time.';

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

function makeMember(
  role: MemberRole,
  status: MembershipStatus = 'active',
  userId = AUTH.uid,
): ChallengeMember {
  return {
    ...makeMembership(role, status, userId),
    name: 'Ada',
    photoURL: null,
  };
}

const membershipOf = (membership: Membership | undefined) => () =>
  Promise.resolve(membership);

const membershipsOf =
  (byUser: Record<string, Membership | undefined>) =>
  (_challengeId: string, userId: string) =>
    Promise.resolve(byUser[userId]);

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
        listMembers: () => Promise.resolve([makeMember(role)]),
      }).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.equal(result.challenge.id, CHALLENGE_ID);
      assert.equal(result.challenge.createdAt, '2026-01-01T00:00:00.000Z');
      assert.deepEqual(result.members, [
        {
          userId: 'user-1',
          role,
          status: 'active',
          joinedAt: '2026-01-02T00:00:00.000Z',
          name: 'Ada',
          photoURL: null,
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
          makeMember('member'),
          makeMember('member', 'left', 'user-2'),
          makeMember('admin', 'removed', 'user-3'),
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

describe('challengeHandlers.join', () => {
  const joinable = (membership: Membership | undefined) => ({
    findByJoinCode: () => Promise.resolve({ challengeId: CHALLENGE_ID }),
    get: () => Promise.resolve(makeChallenge()),
    getMembership: membershipOf(membership),
  });

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().join(makeRequest(undefined, { code: JOIN_CODE })),
      /Must be signed in to join a challenge\./,
    );
  });

  test('rejects a code the alphabet cannot produce', async () => {
    await assert.rejects(
      handlers().join(makeRequest(AUTH, { code: 'ABCD-23' })),
      /Not a valid join code\./,
    );
  });

  test('normalizes the code before looking it up', async () => {
    const codes: string[] = [];
    await handlers({
      findByJoinCode: (code) => {
        codes.push(code);
        return Promise.resolve({ challengeId: CHALLENGE_ID });
      },
      get: () => Promise.resolve(makeChallenge()),
      getMembership: membershipOf(makeMembership('member')),
    }).join(makeRequest(AUTH, { code: ' abcd-2345 ' }));

    assert.deepEqual(codes, [JOIN_CODE]);
  });

  test('reports an unknown code as not found', async () => {
    await rejectsWith('not-found', CODE_UNKNOWN, () =>
      handlers({ findByJoinCode: () => Promise.resolve(undefined) }).join(
        makeRequest(AUTH, { code: JOIN_CODE }),
      ),
    );
  });

  test('refuses a complete challenge', async () => {
    await rejectsWith('conflict', JOIN_CLOSED, () =>
      handlers({
        findByJoinCode: () => Promise.resolve({ challengeId: CHALLENGE_ID }),
        get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
      }).join(makeRequest(AUTH, { code: JOIN_CODE })),
    );
  });

  test('refuses a removed member, who cannot rejoin', async () => {
    await rejectsWith('forbidden', REJOIN_DENIED, () =>
      handlers(joinable(makeMembership('member', 'removed'))).join(
        makeRequest(AUTH, { code: JOIN_CODE }),
      ),
    );
  });

  test('leaves an active membership untouched', async () => {
    const result = await handlers(joinable(makeMembership('owner'))).join(
      makeRequest(AUTH, { code: JOIN_CODE }),
    );

    assert.deepEqual(result, {
      challengeId: CHALLENGE_ID,
      alreadyMember: true,
    });
  });

  test('admits a first-time joiner as a member', async () => {
    const calls: unknown[] = [];
    const result = await handlers({
      ...joinable(undefined),
      upsertMembership: (challengeId, userId, fields) => {
        calls.push([challengeId, userId, fields]);
        return Promise.resolve();
      },
    }).join(makeRequest(AUTH, { code: JOIN_CODE }));

    assert.deepEqual(result, {
      challengeId: CHALLENGE_ID,
      alreadyMember: false,
    });
    assert.deepEqual(calls, [
      [CHALLENGE_ID, 'user-1', { role: 'member', status: 'active' }],
    ]);
  });

  test('readmits a left owner as a member, not as an owner', async () => {
    const calls: unknown[] = [];
    await handlers({
      ...joinable(makeMembership('owner', 'left')),
      upsertMembership: (_challengeId, _userId, fields) => {
        calls.push(fields);
        return Promise.resolve();
      },
    }).join(makeRequest(AUTH, { code: JOIN_CODE }));

    assert.deepEqual(calls, [{ role: 'member', status: 'active' }]);
  });

  test('admits a joiner to a draft challenge', async () => {
    const result = await handlers({
      findByJoinCode: () => Promise.resolve({ challengeId: CHALLENGE_ID }),
      get: () => Promise.resolve(makeChallenge({ status: 'draft' })),
      getMembership: membershipOf(undefined),
      upsertMembership: () => Promise.resolve(),
    }).join(makeRequest(AUTH, { code: JOIN_CODE }));

    assert.equal(result.alreadyMember, false);
  });
});

describe('challengeHandlers.leave', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().leave(makeRequest(undefined, { challengeId: CHALLENGE_ID })),
      /Must be signed in to leave a challenge\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).leave(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID }),
      ),
    );
  });

  test('refuses a complete challenge, whose membership is frozen', async () => {
    await rejectsWith('conflict', MEMBERSHIP_FROZEN, () =>
      handlers({
        getMembership: membershipOf(makeMembership('member')),
        get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
      }).leave(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
    );
  });

  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`an ${role} leaves their own membership`, async () => {
      const calls: unknown[] = [];
      await handlers({
        getMembership: membershipOf(makeMembership(role)),
        get: () => Promise.resolve(makeChallenge()),
        leave: (challengeId, userId) => {
          calls.push([challengeId, userId]);
          return Promise.resolve();
        },
      }).leave(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.deepEqual(calls, [[CHALLENGE_ID, 'user-1']]);
    });
  }

  test('forwards the last-owner rejection the repository raises', async () => {
    await rejectsWith('conflict', LAST_OWNER, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge()),
        leave: () => Promise.reject(new DomainError('conflict', LAST_OWNER)),
      }).leave(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
    );
  });
});

describe('challengeHandlers.rotateJoinCode', () => {
  const rotatable = (role: MemberRole) => ({
    getMembership: membershipOf(makeMembership(role)),
    get: () => Promise.resolve(makeChallenge()),
  });

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().rotateJoinCode(
        makeRequest(undefined, { challengeId: CHALLENGE_ID }),
      ),
      /Must be signed in to replace a join code\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).rotateJoinCode(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID }),
      ),
    );
  });

  test('refuses a member, who does not manage join codes', async () => {
    const error = await rejectsWith('forbidden', DENIED, () =>
      handlers(rotatable('member')).rotateJoinCode(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID }),
      ),
    );

    assert.deepEqual(error.details, {
      permission: 'joinCode.manage',
      role: 'member',
    });
  });

  test('refuses a complete challenge, whose code nobody can use', async () => {
    await rejectsWith('conflict', JOIN_CLOSED, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
      }).rotateJoinCode(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
    );
  });

  for (const role of ['owner', 'admin'] as const) {
    test(`an ${role} replaces the code and is recorded as its creator`, async () => {
      const calls: unknown[] = [];
      const result = await handlers({
        ...rotatable(role),
        rotateJoinCode: (challengeId, createdBy) => {
          calls.push([challengeId, createdBy]);
          return Promise.resolve(JOIN_CODE);
        },
      }).rotateJoinCode(makeRequest(AUTH, { challengeId: CHALLENGE_ID }));

      assert.deepEqual(result, { joinCode: JOIN_CODE });
      assert.deepEqual(calls, [[CHALLENGE_ID, 'user-1']]);
    });
  }
});

describe('challengeHandlers.removeMember', () => {
  const roster = (actor: MemberRole, target: Membership | undefined) => ({
    getMembership: membershipsOf({
      [AUTH.uid]: makeMembership(actor),
      [TARGET]: target,
    }),
    get: () => Promise.resolve(makeChallenge()),
  });

  const removal = { challengeId: CHALLENGE_ID, userId: TARGET };

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().removeMember(makeRequest(undefined, removal)),
      /Must be signed in to remove a member\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).removeMember(
        makeRequest(AUTH, removal),
      ),
    );
  });

  test('refuses a complete challenge', async () => {
    await rejectsWith('conflict', MEMBERS_FROZEN, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
      }).removeMember(makeRequest(AUTH, removal)),
    );
  });

  for (const status of ['left', 'removed'] as const) {
    test(`reports a ${status} target as not in the challenge`, async () => {
      await rejectsWith('not-found', MEMBER_GONE, () =>
        handlers(
          roster('owner', makeMembership('member', status, TARGET)),
        ).removeMember(makeRequest(AUTH, removal)),
      );
    });
  }

  test('refuses a member, who does not remove anyone', async () => {
    const error = await rejectsWith('forbidden', DENIED, () =>
      handlers(
        roster('member', makeMembership('member', 'active', TARGET)),
      ).removeMember(makeRequest(AUTH, removal)),
    );

    assert.deepEqual(error.details, {
      permission: 'member.remove',
      role: 'member',
    });
  });

  for (const [actor, target] of [
    ['admin', 'admin'],
    ['admin', 'owner'],
    ['owner', 'owner'],
  ] as const) {
    test(`refuses an ${actor} removing a ${target}, who is not outranked`, async () => {
      await rejectsWith('forbidden', DENIED, () =>
        handlers(
          roster(actor, makeMembership(target, 'active', TARGET)),
        ).removeMember(makeRequest(AUTH, removal)),
      );
    });
  }

  test('refuses removing yourself, which is what leaving is for', async () => {
    await rejectsWith('forbidden', DENIED, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge()),
      }).removeMember(
        makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: AUTH.uid }),
      ),
    );
  });

  test('marks the membership removed and keeps the role it held', async () => {
    const calls: unknown[] = [];
    await handlers({
      ...roster('owner', makeMembership('admin', 'active', TARGET)),
      upsertMembership: (challengeId, userId, fields) => {
        calls.push([challengeId, userId, fields]);
        return Promise.resolve();
      },
    }).removeMember(makeRequest(AUTH, removal));

    assert.deepEqual(calls, [
      [CHALLENGE_ID, TARGET, { role: 'admin', status: 'removed' }],
    ]);
  });
});

describe('challengeHandlers.setMemberRole', () => {
  const roster = (actor: MemberRole, target: Membership | undefined) => ({
    getMembership: membershipsOf({
      [AUTH.uid]: makeMembership(actor),
      [TARGET]: target,
    }),
    get: () => Promise.resolve(makeChallenge()),
  });

  const change = (role: MemberRole, userId = TARGET) => ({
    challengeId: CHALLENGE_ID,
    userId,
    role,
  });

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().setMemberRole(makeRequest(undefined, change('admin'))),
      /Must be signed in to change a role\./,
    );
  });

  test('rejects a role outside the ladder', async () => {
    await assert.rejects(
      handlers().setMemberRole(
        makeRequest(AUTH, {
          challengeId: CHALLENGE_ID,
          userId: TARGET,
          role: 'superadmin',
        }),
      ),
      /expected one of/,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).setMemberRole(
        makeRequest(AUTH, change('admin')),
      ),
    );
  });

  test('refuses a complete challenge', async () => {
    await rejectsWith('conflict', MEMBERS_FROZEN, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge({ status: 'complete' })),
      }).setMemberRole(makeRequest(AUTH, change('admin'))),
    );
  });

  test('reports a target who is not a member as not in the challenge', async () => {
    await rejectsWith('not-found', MEMBER_GONE, () =>
      handlers(roster('owner', undefined)).setMemberRole(
        makeRequest(AUTH, change('admin')),
      ),
    );
  });

  test('refuses a member, who changes nobody', async () => {
    const error = await rejectsWith('forbidden', DENIED, () =>
      handlers(
        roster('member', makeMembership('member', 'active', TARGET)),
      ).setMemberRole(makeRequest(AUTH, change('admin'))),
    );

    assert.deepEqual(error.details, {
      permission: 'member.setRole',
      role: 'member',
    });
  });

  test('refuses an admin granting a role above their own', async () => {
    await rejectsWith('forbidden', DENIED, () =>
      handlers(
        roster('admin', makeMembership('member', 'active', TARGET)),
      ).setMemberRole(makeRequest(AUTH, change('owner'))),
    );
  });

  test('refuses an owner demoting another owner', async () => {
    await rejectsWith('forbidden', DENIED, () =>
      handlers(
        roster('owner', makeMembership('owner', 'active', TARGET)),
      ).setMemberRole(makeRequest(AUTH, change('member'))),
    );
  });

  test('refuses promoting yourself', async () => {
    await rejectsWith('forbidden', DENIED, () =>
      handlers({
        getMembership: membershipOf(makeMembership('admin')),
        get: () => Promise.resolve(makeChallenge()),
      }).setMemberRole(makeRequest(AUTH, change('owner', AUTH.uid))),
    );
  });

  test('lets an owner step down to a lower role', async () => {
    const calls: unknown[] = [];
    await handlers({
      getMembership: membershipOf(makeMembership('owner')),
      get: () => Promise.resolve(makeChallenge()),
      setRole: (challengeId, userId, role) => {
        calls.push([challengeId, userId, role]);
        return Promise.resolve();
      },
    }).setMemberRole(makeRequest(AUTH, change('member', AUTH.uid)));

    assert.deepEqual(calls, [[CHALLENGE_ID, AUTH.uid, 'member']]);
  });

  test('forwards the last-owner rejection the repository raises', async () => {
    await rejectsWith('conflict', LAST_OWNER_ROLE, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge()),
        setRole: () =>
          Promise.reject(new DomainError('conflict', LAST_OWNER_ROLE)),
      }).setMemberRole(makeRequest(AUTH, change('member', AUTH.uid))),
    );
  });

  for (const [actor, from, to] of [
    ['admin', 'member', 'admin'],
    ['owner', 'member', 'owner'],
    ['owner', 'admin', 'member'],
  ] as const) {
    test(`an ${actor} moves a ${from} to ${to}`, async () => {
      const calls: unknown[] = [];
      await handlers({
        ...roster(actor, makeMembership(from, 'active', TARGET)),
        setRole: (challengeId, userId, role) => {
          calls.push([challengeId, userId, role]);
          return Promise.resolve();
        },
      }).setMemberRole(makeRequest(AUTH, change(to)));

      assert.deepEqual(calls, [[CHALLENGE_ID, TARGET, to]]);
    });
  }
});

describe('challengeHandlers.getMyChallenges', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().getMyChallenges(makeRequest(undefined, {})),
      /Must be signed in to load your challenges\./,
    );
  });

  test('returns each challenge with the caller’s membership, encoded', async () => {
    const result = await handlers({
      getChallengesByUserId: () =>
        Promise.resolve([
          {
            challenge: makeChallenge(),
            membership: makeMembership('admin'),
          },
        ]),
    }).getMyChallenges(makeRequest(AUTH, {}));

    assert.deepEqual(result, {
      challenges: [
        {
          challenge: {
            id: CHALLENGE_ID,
            name: 'Summer Reading',
            status: 'active',
            tagCap: 3,
            createdBy: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          membership: {
            userId: 'user-1',
            role: 'admin',
            status: 'active',
            joinedAt: '2026-01-02T00:00:00.000Z',
          },
        },
      ],
    });
  });

  test('passes the caller as the user whose challenges are listed', async () => {
    const calls: string[] = [];
    await handlers({
      getChallengesByUserId: (userId) => {
        calls.push(userId);
        return Promise.resolve([]);
      },
    }).getMyChallenges(makeRequest(AUTH, {}));

    assert.deepEqual(calls, ['user-1']);
  });
});

describe('challengeHandlers.setStatus', () => {
  const transition = (status: 'draft' | 'active' | 'complete') => ({
    challengeId: CHALLENGE_ID,
    status,
  });

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().setStatus(makeRequest(undefined, transition('active'))),
      /Must be signed in to change a challenge status\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).setStatus(
        makeRequest(AUTH, transition('active')),
      ),
    );
  });

  for (const role of ['admin', 'member'] as const) {
    test(`refuses an ${role}, who does not change the status`, async () => {
      const error = await rejectsWith('forbidden', DENIED, () =>
        handlers({
          getMembership: membershipOf(makeMembership(role)),
        }).setStatus(makeRequest(AUTH, transition('complete'))),
      );

      assert.deepEqual(error.details, {
        permission: 'status.change',
        role,
      });
    });
  }

  for (const [from, to] of [
    ['draft', 'complete'],
    ['active', 'draft'],
    ['complete', 'active'],
    ['active', 'active'],
  ] as const) {
    test(`refuses ${from} to ${to}, which is not the next step`, async () => {
      const error = await rejectsWith('conflict', TRANSITION_DENIED, () =>
        handlers({
          getMembership: membershipOf(makeMembership('owner')),
          get: () => Promise.resolve(makeChallenge({ status: from })),
        }).setStatus(makeRequest(AUTH, transition(to))),
      );

      assert.deepEqual(error.details, { from, to });
    });
  }

  for (const [from, to] of [
    ['draft', 'active'],
    ['active', 'complete'],
  ] as const) {
    test(`an owner moves ${from} to ${to}`, async () => {
      const calls: unknown[] = [];
      await handlers({
        getMembership: membershipOf(makeMembership('owner')),
        get: () => Promise.resolve(makeChallenge({ status: from })),
        setStatus: (challengeId, status) => {
          calls.push([challengeId, status]);
          return Promise.resolve(from);
        },
      }).setStatus(makeRequest(AUTH, transition(to)));

      assert.deepEqual(calls, [[CHALLENGE_ID, to]]);
    });
  }
});

describe('challengeHandlers.remove', () => {
  const deletion = { challengeId: CHALLENGE_ID };

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().remove(makeRequest(undefined, deletion)),
      /Must be signed in to delete a challenge\./,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({ getMembership: membershipOf(undefined) }).remove(
        makeRequest(AUTH, deletion),
      ),
    );
  });

  for (const role of ['admin', 'member'] as const) {
    test(`refuses an ${role}, who does not delete a challenge`, async () => {
      const error = await rejectsWith('forbidden', DENIED, () =>
        handlers({
          getMembership: membershipOf(makeMembership(role)),
        }).remove(makeRequest(AUTH, deletion)),
      );

      assert.deepEqual(error.details, {
        permission: 'challenge.delete',
        role,
      });
    });
  }

  test('deletes without reading the status: no lifecycle gate (rule 36)', async () => {
    const calls: string[] = [];
    await handlers({
      getMembership: membershipOf(makeMembership('owner')),
      remove: (challengeId) => {
        calls.push(challengeId);
        return Promise.resolve();
      },
    }).remove(makeRequest(AUTH, deletion));

    assert.deepEqual(calls, [CHALLENGE_ID]);
  });

  test('forwards the repository’s refusal when history still exists', async () => {
    const blocked = 'That challenge cannot be deleted while readings exist.';
    await rejectsWith('conflict', blocked, () =>
      handlers({
        getMembership: membershipOf(makeMembership('owner')),
        remove: () => Promise.reject(new DomainError('conflict', blocked)),
      }).remove(makeRequest(AUTH, deletion)),
    );
  });
});
