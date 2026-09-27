import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  CHALLENGE_STATUSES,
  ChallengeDocSchema,
  CreateChallengeRequestSchema,
  DeleteChallengeRequestSchema,
  GetChallengeRequestSchema,
  JoinChallengeRequestSchema,
  LeaveChallengeRequestSchema,
  MEMBER_ROLES,
  MembershipDocSchema,
  RemoveMemberRequestSchema,
  RotateJoinCodeRequestSchema,
  SetChallengeStatusRequestSchema,
  SetMemberRoleRequestSchema,
  UpdateChallengeConfigRequestSchema,
} from './schema.js';
import { generateJoinCode } from './joinCode.js';

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

describe('CreateChallengeRequestSchema', () => {
  const request = { name: 'Summer 2026', tagCap: 3 };

  test('trims the name', () => {
    const parsed = CreateChallengeRequestSchema.parse({
      ...request,
      name: '  Summer 2026  ',
    });
    assert.equal(parsed.name, 'Summer 2026');
  });

  test('rejects a name that is only whitespace', () => {
    assert.throws(() =>
      CreateChallengeRequestSchema.parse({ ...request, name: '   ' }),
    );
  });

  test('rejects a name over 100 characters', () => {
    assert.throws(() =>
      CreateChallengeRequestSchema.parse({ ...request, name: 'x'.repeat(101) }),
    );
  });

  test('rejects a fractional cap', () => {
    assert.throws(() =>
      CreateChallengeRequestSchema.parse({ ...request, tagCap: 2.5 }),
    );
  });

  test('rejects a cap of zero, which would allow no tags at all', () => {
    assert.throws(() =>
      CreateChallengeRequestSchema.parse({ ...request, tagCap: 0 }),
    );
  });
});

describe('challenge reference schemas', () => {
  const REF_SCHEMAS = {
    GetChallengeRequestSchema,
    LeaveChallengeRequestSchema,
    DeleteChallengeRequestSchema,
    RotateJoinCodeRequestSchema,
  };

  for (const [name, schema] of Object.entries(REF_SCHEMAS)) {
    test(`${name} takes a challengeId`, () => {
      assert.deepEqual(schema.parse({ challengeId: 'c1' }), {
        challengeId: 'c1',
      });
    });

    test(`${name} rejects an empty challengeId`, () => {
      assert.throws(() => schema.parse({ challengeId: '' }));
    });

    test(`${name} rejects a missing challengeId`, () => {
      assert.throws(() => schema.parse({}));
    });
  }
});

describe('RemoveMemberRequestSchema', () => {
  test('takes the challenge and the member', () => {
    assert.deepEqual(
      RemoveMemberRequestSchema.parse({ challengeId: 'c1', userId: 'u1' }),
      { challengeId: 'c1', userId: 'u1' },
    );
  });

  test('rejects an empty userId', () => {
    assert.throws(() =>
      RemoveMemberRequestSchema.parse({ challengeId: 'c1', userId: '' }),
    );
  });
});

describe('SetMemberRoleRequestSchema', () => {
  const request = { challengeId: 'c1', userId: 'u1', role: 'admin' };

  test('accepts every assignable role', () => {
    for (const role of MEMBER_ROLES) {
      assert.equal(
        SetMemberRoleRequestSchema.parse({ ...request, role }).role,
        role,
      );
    }
  });

  test('rejects a role outside the ladder', () => {
    assert.throws(() =>
      SetMemberRoleRequestSchema.parse({ ...request, role: 'superadmin' }),
    );
  });

  test('rejects a missing role', () => {
    assert.throws(() =>
      SetMemberRoleRequestSchema.parse({ challengeId: 'c1', userId: 'u1' }),
    );
  });
});

describe('SetChallengeStatusRequestSchema', () => {
  test('parses every status, leaving the transition to canTransition', () => {
    for (const status of CHALLENGE_STATUSES) {
      assert.equal(
        SetChallengeStatusRequestSchema.parse({ challengeId: 'c1', status })
          .status,
        status,
      );
    }
  });

  test('rejects a status outside the lifecycle', () => {
    assert.throws(() =>
      SetChallengeStatusRequestSchema.parse({
        challengeId: 'c1',
        status: 'archived',
      }),
    );
  });
});

describe('UpdateChallengeConfigRequestSchema', () => {
  test('accepts a rename alone', () => {
    assert.deepEqual(
      UpdateChallengeConfigRequestSchema.parse({
        challengeId: 'c1',
        name: 'Autumn 2026',
      }),
      { challengeId: 'c1', name: 'Autumn 2026' },
    );
  });

  test('accepts a cap change alone', () => {
    assert.deepEqual(
      UpdateChallengeConfigRequestSchema.parse({
        challengeId: 'c1',
        tagCap: 4,
      }),
      { challengeId: 'c1', tagCap: 4 },
    );
  });

  test('accepts both together', () => {
    const parsed = UpdateChallengeConfigRequestSchema.parse({
      challengeId: 'c1',
      name: 'Autumn 2026',
      tagCap: 4,
    });
    assert.deepEqual(parsed, {
      challengeId: 'c1',
      name: 'Autumn 2026',
      tagCap: 4,
    });
  });

  test('rejects a payload that changes nothing', () => {
    assert.throws(() =>
      UpdateChallengeConfigRequestSchema.parse({ challengeId: 'c1' }),
    );
  });

  test('applies the same name and cap rules as creation', () => {
    assert.throws(() =>
      UpdateChallengeConfigRequestSchema.parse({
        challengeId: 'c1',
        name: '   ',
      }),
    );
    assert.throws(() =>
      UpdateChallengeConfigRequestSchema.parse({
        challengeId: 'c1',
        tagCap: -1,
      }),
    );
  });
});

describe('JoinChallengeRequestSchema', () => {
  const parse = (code: string) =>
    JoinChallengeRequestSchema.parse({ code }).code;

  test('passes a generated code through unchanged', () => {
    const code = generateJoinCode();
    assert.equal(parse(code), code);
  });

  test('normalizes case, separators and look-alike characters', () => {
    assert.equal(parse(' abc-de234 '), 'ABCDE234');
    assert.equal(parse('oil23456'), '01123456');
  });

  test('rejects a code of the wrong length', () => {
    assert.throws(() => parse('ABCDE'));
    assert.throws(() => parse('ABCDE23'));
    assert.throws(() => parse(''));
  });

  test('rejects a character outside the alphabet', () => {
    assert.throws(() => parse('ABCDEFG$'));
  });

  test('rejects U, which the alphabet omits and normalization does not fold', () => {
    assert.throws(() => parse('ABCDEFU2'));
  });
});
