import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  CHALLENGE_GONE,
  type ChallengeRepository,
  type Membership,
} from '../challenges/postgresStore.js';
import type { MemberRole, MembershipStatus } from '../challenges/schema.js';
import { DomainError } from '../common/errors.js';
import type { Reading, ReadingRepository } from '../readings/postgresStore.js';
import type { Tag, TagRepository } from '../tags/postgresStore.js';
import { scoringHandlers } from './handler.js';
import { scorer } from './scorer.js';

const AUTH = { uid: 'user-1', token: {}, rawToken: 'test' };

const CHALLENGE_ID = 'challenge-1';

const OTHER = 'user-2';

const DATA = { challengeId: CHALLENGE_ID, userId: AUTH.uid };

const unexpected = (name: string) => () =>
  Promise.reject(new Error(`unexpected ${name} call`));

const VOCABULARY: Tag[] = Array.from({ length: 25 }, (_, i) => ({
  id: `tag-${i + 1}`,
  label: `tag ${i + 1}`,
}));

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

function fakeTagRepo(tags: Tag[] = VOCABULARY): TagRepository {
  return {
    listByChallenge: () => Promise.resolve(tags),
    create: unexpected('create'),
    update: unexpected('update'),
    remove: unexpected('remove'),
  };
}

const handlers = (
  readings: Partial<ReadingRepository> = {},
  challenges: Partial<ChallengeRepository> = {},
  tags: Tag[] = VOCABULARY,
) =>
  scoringHandlers(
    fakeReadingRepo(readings),
    fakeChallengeRepo(challenges),
    scorer(fakeTagRepo(tags)),
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

function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'reading-1',
    userId: AUTH.uid,
    bookId: 'a'.repeat(32),
    tagIds: ['tag-1'],
    isFreebie: false,
    readAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
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
): Promise<void> {
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
}

const readingsOf = (readings: Reading[]) => ({
  list: () => Promise.resolve(readings),
});

describe('scoringHandlers.get access', () => {
  test('requires a signed-in caller', async () => {
    await assert.rejects(
      handlers().get(makeRequest(undefined, DATA)),
      /Must be signed in to load a score\./,
    );
  });

  test('rejects a missing challenge id', async () => {
    await assert.rejects(
      handlers().get(makeRequest(AUTH, { ...DATA, challengeId: '' })),
      /Too small: expected string to have >=1 characters/,
    );
  });

  test('rejects a missing user id', async () => {
    await assert.rejects(
      handlers().get(makeRequest(AUTH, { challengeId: CHALLENGE_ID })),
      /Invalid input/,
    );
  });

  test('tells a non-member the challenge does not exist', async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers({}, { getMembership: membershipOf(undefined) }).get(
        makeRequest(AUTH, DATA),
      ),
    );
  });

  for (const status of ['left', 'removed'] as const) {
    test(`tells a ${status} member the same thing, in the same words`, async () => {
      await rejectsWith('not-found', CHALLENGE_GONE, () =>
        handlers(
          {},
          { getMembership: membershipOf(makeMembership('owner', status)) },
        ).get(makeRequest(AUTH, DATA)),
      );
    });
  }

  test("hides a left member's score from another member", async () => {
    await rejectsWith('not-found', CHALLENGE_GONE, () =>
      handlers(
        {},
        {
          getMembership: membershipsOf({
            [AUTH.uid]: makeMembership('member'),
            [OTHER]: makeMembership('member', 'left', OTHER),
          }),
        },
      ).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: OTHER })),
    );
  });
});

describe('scoringHandlers.get', () => {
  test('scores from tag ids, so a tag counts as a tile', async () => {
    const result = await handlers(
      readingsOf([
        makeReading({ tagIds: ['tag-1'] }),
        makeReading({ id: 'r2', tagIds: ['tag-2', 'tag-3'] }),
        makeReading({ id: 'r3', tagIds: ['tag-1'] }),
      ]),
      { getMembership: membershipOf(makeMembership('member')) },
    ).get(makeRequest(AUTH, DATA));

    assert.deepEqual(result.tileCounts, {
      'tag-1': 2,
      'tag-2': 1,
      'tag-3': 1,
    });
    assert.equal(result.varietyPoints, 3);
    assert.equal(result.totalBooks, 3);
    assert.ok(result.volumePoints > 0);
    assert.equal(result.score, result.varietyPoints + result.volumePoints);
  });

  test('returns zeros for a member with no readings', async () => {
    const result = await handlers(readingsOf([]), {
      getMembership: membershipOf(makeMembership('member')),
    }).get(makeRequest(AUTH, DATA));

    assert.deepEqual(result, {
      score: 0,
      varietyPoints: 0,
      volumePoints: 0,
      tileCounts: {},
      totalBooks: 0,
    });
  });

  test("serves another active member's score", async () => {
    const result = await handlers(
      readingsOf([makeReading({ userId: OTHER })]),
      {
        getMembership: membershipsOf({
          [AUTH.uid]: makeMembership('member'),
          [OTHER]: makeMembership('member', 'active', OTHER),
        }),
      },
    ).get(makeRequest(AUTH, { challengeId: CHALLENGE_ID, userId: OTHER }));

    assert.equal(result.score, 1);
  });

  test('decays against the challenge vocabulary, not the catalog', async () => {
    const readings = readingsOf([
      makeReading({ tagIds: ['tag-1'] }),
      makeReading({ id: 'r2', tagIds: ['tag-1'] }),
      makeReading({ id: 'r3', tagIds: ['tag-2'] }),
    ]);
    const access = { getMembership: membershipOf(makeMembership('member')) };

    const narrow = await handlers(readings, access, VOCABULARY.slice(0, 2)).get(
      makeRequest(AUTH, DATA),
    );
    const wide = await handlers(readings, access, VOCABULARY).get(
      makeRequest(AUTH, DATA),
    );

    // Two tiles is full coverage of a two-tag vocabulary and almost none of a
    // 25-tag one, so the repeat is worth more in the narrow challenge.
    assert.ok(narrow.volumePoints > wide.volumePoints);
    assert.equal(narrow.varietyPoints, wide.varietyPoints);
  });
});
