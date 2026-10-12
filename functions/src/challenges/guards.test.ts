import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  actorOf,
  requireMembership,
  requirePermission,
  requireReadAccess,
  requireStatus,
} from './guards.js';
import {
  CHALLENGE_ACTIONS,
  PERMISSIONS,
  type ChallengeAction,
} from './permissions.js';
import {
  CHALLENGE_STATUSES,
  MEMBER_ROLES,
  MEMBERSHIP_STATUSES,
  type ChallengeStatus,
  type MemberRole,
  type MembershipStatus,
} from './schema.js';
import type { Challenge, Membership } from './postgresStore.js';

const notFound = { name: 'DomainError', kind: 'not-found' };
const forbidden = { name: 'DomainError', kind: 'forbidden' };
const conflict = { name: 'DomainError', kind: 'conflict' };

const JOINED_AT = new Date('2026-01-01T00:00:00Z');

function membershipOf(
  role: MemberRole,
  status: MembershipStatus = 'active',
): Membership {
  return { userId: 'u1', role, status, joinedAt: JOINED_AT };
}

function challengeOf(status: ChallengeStatus): Challenge {
  return {
    id: '2c91359f-260f-4372-a379-6a2c45488e84',
    name: 'Book Bingo',
    status,
    tagCap: 3,
    createdBy: 'u1',
    createdAt: JOINED_AT,
  };
}

const owner = { role: 'owner' as const, superadmin: false };
const admin = { role: 'admin' as const, superadmin: false };
const member = { role: 'member' as const, superadmin: false };
const outsider = { role: undefined, superadmin: false };
const superadmin = { role: undefined, superadmin: true };

describe('actorOf', () => {
  for (const role of MEMBER_ROLES) {
    test(`carries the role of an active ${role}`, () => {
      assert.deepEqual(actorOf(membershipOf(role), false), {
        role,
        superadmin: false,
      });
    });
  }

  // Rule 27: a non-`active` membership fails the guard exactly as a missing one does.
  for (const status of MEMBERSHIP_STATUSES.filter((s) => s !== 'active')) {
    test(`drops the role of a ${status} owner`, () => {
      assert.equal(
        actorOf(membershipOf('owner', status), false).role,
        undefined,
      );
    });
  }

  test('a missing membership has no role', () => {
    assert.equal(actorOf(undefined, false).role, undefined);
  });

  // Rule 42: superadmin holds no membership row.
  test('carries the superadmin claim without a membership', () => {
    assert.deepEqual(actorOf(undefined, true), {
      role: undefined,
      superadmin: true,
    });
  });

  test('carries the superadmin claim alongside a role', () => {
    assert.deepEqual(actorOf(membershipOf('member'), true), {
      role: 'member',
      superadmin: true,
    });
  });
});

describe('requireMembership', () => {
  test('returns the active row', () => {
    const membership = membershipOf('member');
    assert.equal(requireMembership(membership), membership);
  });

  test('rejects a missing membership as not-found', () => {
    assert.throws(() => requireMembership(undefined), notFound);
  });

  for (const status of MEMBERSHIP_STATUSES.filter((s) => s !== 'active')) {
    test(`rejects a ${status} membership as not-found`, () => {
      assert.throws(
        () => requireMembership(membershipOf('owner', status)),
        notFound,
      );
    });
  }
});

describe('requirePermission', () => {
  for (const permission of PERMISSIONS) {
    test(`an outsider gets not-found, not forbidden, for ${permission}`, () => {
      assert.throws(() => requirePermission(outsider, permission), notFound);
    });

    test(`a superadmin passes ${permission}`, () => {
      assert.doesNotThrow(() => requirePermission(superadmin, permission));
    });
  }

  test('a member holding the permission passes', () => {
    assert.doesNotThrow(() => requirePermission(member, 'reading.write.own'));
  });

  test('a member lacking the permission gets forbidden', () => {
    assert.throws(() => requirePermission(member, 'config.edit'), forbidden);
  });

  test('an admin short of owner gets forbidden', () => {
    assert.throws(() => requirePermission(admin, 'status.change'), forbidden);
  });

  test('an owner short of superadmin gets forbidden', () => {
    assert.throws(() => requirePermission(owner, 'tag.delete'), forbidden);
  });

  test('the forbidden details name the permission and role, the message does not', () => {
    try {
      requirePermission(member, 'config.edit');
      assert.fail('expected a forbidden DomainError');
    } catch (error) {
      assert.ok(error instanceof Error);
      const { details, message } = error as Error & {
        details: Record<string, unknown>;
      };
      assert.deepEqual(details, { permission: 'config.edit', role: 'member' });
      assert.equal(message.includes('config.edit'), false);
    }
  });

  // The outsider branch must not depend on a read guard running first.
  test('a left member reaches the outsider branch through actorOf', () => {
    assert.throws(
      () =>
        requirePermission(
          actorOf(membershipOf('owner', 'left'), false),
          'challenge.delete',
        ),
      notFound,
    );
  });
});

describe('requireReadAccess', () => {
  for (const role of MEMBER_ROLES) {
    // Rule 15: every role participates; there is no spectator.
    test(`an active ${role} may read`, () => {
      assert.doesNotThrow(() => requireReadAccess({ role, superadmin: false }));
    });
  }

  // Rule 44: all challenges are private, and an outsider learns nothing.
  test('an outsider gets not-found', () => {
    assert.throws(() => requireReadAccess(outsider), notFound);
  });

  test('a superadmin may read', () => {
    assert.doesNotThrow(() => requireReadAccess(superadmin));
  });
});

/** Transcribed from rules 34–36, not from `STATUS_ALLOWS`: deriving it would assert nothing. */
const ALLOWED: Record<ChallengeStatus, ChallengeAction[]> = {
  draft: ['join', 'configEdit', 'rename', 'memberManage', 'delete'],
  active: ['join', 'readingWrite', 'rename', 'memberManage', 'delete'],
  complete: ['delete'],
};

describe('requireStatus', () => {
  for (const status of CHALLENGE_STATUSES) {
    for (const action of CHALLENGE_ACTIONS) {
      const permitted = ALLOWED[status].includes(action);
      test(`${status} ${permitted ? 'permits' : 'refuses'} ${action}`, () => {
        const challenge = challengeOf(status);
        if (permitted) {
          assert.doesNotThrow(() => requireStatus(challenge, action));
        } else {
          assert.throws(() => requireStatus(challenge, action), conflict);
        }
      });
    }
  }

  test('the message names the status that refused', () => {
    assert.throws(() => requireStatus(challengeOf('complete'), 'join'), {
      message: /complete/,
    });
  });

  // Rule 36 freezes the lifecycle for everyone: no role and no claim unlocks it.
  test('a superadmin does not unlock a frozen action', () => {
    assert.throws(
      () => requireStatus(challengeOf('complete'), 'readingWrite'),
      conflict,
    );
    assert.doesNotThrow(() =>
      requirePermission(superadmin, 'reading.write.any'),
    );
  });
});
