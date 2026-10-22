import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  toChallengeDTO,
  toChallengeMembershipDTO,
  toMemberDTO,
  toMembershipDTO,
} from './present.js';

const CREATED_AT = new Date('2026-01-02T03:04:05.000Z');

describe('toChallengeDTO', () => {
  test('encodes the instant as an ISO string', () => {
    assert.deepEqual(
      toChallengeDTO({
        id: 'challenge-1',
        name: 'Summer 2026',
        status: 'draft',
        tagCap: 3,
        createdBy: 'user-1',
        createdAt: CREATED_AT,
      }),
      {
        id: 'challenge-1',
        name: 'Summer 2026',
        status: 'draft',
        tagCap: 3,
        createdBy: 'user-1',
        createdAt: '2026-01-02T03:04:05.000Z',
      },
    );
  });
});

describe('toMembershipDTO', () => {
  test('encodes the instant as an ISO string', () => {
    assert.deepEqual(
      toMembershipDTO({
        userId: 'user-1',
        role: 'owner',
        status: 'active',
        joinedAt: CREATED_AT,
      }),
      {
        userId: 'user-1',
        role: 'owner',
        status: 'active',
        joinedAt: '2026-01-02T03:04:05.000Z',
      },
    );
  });
});

describe('toChallengeMembershipDTO', () => {
  test('encodes both sides of the pair', () => {
    assert.deepEqual(
      toChallengeMembershipDTO({
        challenge: {
          id: 'challenge-1',
          name: 'Summer 2026',
          status: 'active',
          tagCap: 3,
          createdBy: 'user-1',
          createdAt: CREATED_AT,
        },
        membership: {
          userId: 'user-1',
          role: 'admin',
          status: 'active',
          joinedAt: CREATED_AT,
        },
      }),
      {
        challenge: {
          id: 'challenge-1',
          name: 'Summer 2026',
          status: 'active',
          tagCap: 3,
          createdBy: 'user-1',
          createdAt: '2026-01-02T03:04:05.000Z',
        },
        membership: {
          userId: 'user-1',
          role: 'admin',
          status: 'active',
          joinedAt: '2026-01-02T03:04:05.000Z',
        },
      },
    );
  });
});

describe('toMemberDTO', () => {
  test('carries the profile beside the membership', () => {
    assert.deepEqual(
      toMemberDTO({
        userId: 'user-1',
        role: 'member',
        status: 'active',
        joinedAt: CREATED_AT,
        name: 'Ada',
        photoURL: 'https://example.test/ada.png',
      }),
      {
        userId: 'user-1',
        role: 'member',
        status: 'active',
        joinedAt: '2026-01-02T03:04:05.000Z',
        name: 'Ada',
        photoURL: 'https://example.test/ada.png',
      },
    );
  });
});
