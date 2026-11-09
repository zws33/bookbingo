import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { boardConfigHandlers } from './handler.js';
import {
  CHALLENGE_GONE,
  type Challenge,
  type ChallengeRepository,
  type Membership,
} from '../challenges/store.js';
import type { MemberRole, MembershipStatus } from '../challenges/schema.js';
import { DomainError } from '../common/errors.js';
import type { TagRepository } from '../tags/store.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

function makeRequest(
  auth: typeof AUTH | undefined,
  data: unknown = {},
): CallableRequest<unknown> {
  return {
    auth,
    data,
    rawRequest: {} as unknown as CallableRequest<unknown>['rawRequest'],
    acceptsStreaming: false,
  } as CallableRequest<unknown>;
}

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
) => boardConfigHandlers(fakeTagRepo(tags), fakeChallengeRepo(challenges));

function makeChallenge(tagCap = 3): Challenge {
  return {
    id: CHALLENGE_ID,
    name: 'Summer Reading',
    status: 'active',
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

describe('boardConfigHandlers.get', () => {
  const data = { challengeId: CHALLENGE_ID };

  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().get(makeRequest(undefined, data)),
      /Must be signed in to load the board\./,
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
        makeRequest(AUTH, data),
      ),
    );
  });

  for (const status of ['left', 'removed'] as const) {
    test(`tells a ${status} member the same thing, in the same words`, async () => {
      await rejectsWith('not-found', CHALLENGE_GONE, () =>
        handlers(
          {},
          { getMembership: membershipOf(makeMembership('owner', status)) },
        ).get(makeRequest(AUTH, data)),
      );
    });
  }

  for (const role of ['owner', 'admin', 'member'] as const) {
    test(`a ${role} reads the board`, async () => {
      const config = await handlers(
        {
          listByChallenge: () =>
            Promise.resolve([
              { id: 'tag-1', label: 'Mystery' },
              { id: 'tag-2', label: 'Translated' },
            ]),
        },
        {
          getMembership: membershipOf(makeMembership(role)),
          get: () => Promise.resolve(makeChallenge()),
        },
      ).get(makeRequest(AUTH, data));

      assert.deepEqual(config, {
        tiles: [
          { id: 'tag-1', name: 'Mystery' },
          { id: 'tag-2', name: 'Translated' },
        ],
        maxTilesPerBook: 3,
      });
    });
  }

  test("serves the challenge's own cap, whatever it is", async () => {
    const config = await handlers(
      { listByChallenge: () => Promise.resolve([]) },
      {
        getMembership: membershipOf(makeMembership('member')),
        get: () => Promise.resolve(makeChallenge(5)),
      },
    ).get(makeRequest(AUTH, data));

    assert.equal(config.maxTilesPerBook, 5);
  });

  test('serves an empty vocabulary when the challenge has no tags', async () => {
    const config = await handlers(
      { listByChallenge: () => Promise.resolve([]) },
      {
        getMembership: membershipOf(makeMembership('member')),
        get: () => Promise.resolve(makeChallenge()),
      },
    ).get(makeRequest(AUTH, data));

    assert.deepEqual(config.tiles, []);
  });
});
