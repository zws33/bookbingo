import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ChallengeDocSchema, MembershipDocSchema } from './schema.js';

const CREATED_AT = new Date('2026-01-02T03:04:05Z');

/** Stands in for an admin Timestamp: `toDate()` is all the schema requires. */
const timestamp = (date: Date) => ({ toDate: () => date });

const challengeDoc = {
  name: 'Summer 2026',
  tagCap: 3,
  status: 'active',
  createdAt: timestamp(CREATED_AT),
  createdBy: 'user-1',
};

const membershipDoc = {
  userId: 'user-1',
  role: 'owner',
  status: 'active',
  joinedAt: timestamp(CREATED_AT),
};

describe('ChallengeDocSchema', () => {
  test('converts the stored timestamp to a date', () => {
    const parsed = ChallengeDocSchema.parse(challengeDoc);
    assert.deepEqual(parsed.createdAt, CREATED_AT);
  });

  test('rejects a status outside the lifecycle', () => {
    assert.throws(() =>
      ChallengeDocSchema.parse({ ...challengeDoc, status: 'in progress' }),
    );
  });
});

describe('MembershipDocSchema', () => {
  test('converts the stored timestamp to a date', () => {
    const parsed = MembershipDocSchema.parse(membershipDoc);
    assert.deepEqual(parsed.joinedAt, CREATED_AT);
  });

  test('reads a pending serverTimestamp() write as now', () => {
    const before = Date.now();
    const parsed = MembershipDocSchema.parse({
      ...membershipDoc,
      joinedAt: null,
    });
    assert.ok(parsed.joinedAt.getTime() >= before);
  });

  test('rejects an unknown role', () => {
    assert.throws(() =>
      MembershipDocSchema.parse({ ...membershipDoc, role: 'superadmin' }),
    );
  });

  test('rejects an unknown status', () => {
    assert.throws(() =>
      MembershipDocSchema.parse({ ...membershipDoc, status: 'banned' }),
    );
  });

  test('rejects an empty userId', () => {
    assert.throws(() =>
      MembershipDocSchema.parse({ ...membershipDoc, userId: '' }),
    );
  });
});
