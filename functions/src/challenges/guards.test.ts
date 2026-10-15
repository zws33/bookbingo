import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  actorOf,
  requireAnotherOwner,
  requireJoinable,
  requireMembership,
  requireOthersReadingWrite,
  requireOwnReadingWrite,
  requirePermission,
  requireReadAccess,
  requireRemoval,
  requireRoleChange,
  requireStatus,
  requireTransition,
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

/** Rule 33, transcribed: a linear chain with no backward or skipping move. */
const TRANSITIONS: [ChallengeStatus, ChallengeStatus][] = [
  ['draft', 'active'],
  ['active', 'complete'],
];

describe('requireTransition', () => {
  for (const from of CHALLENGE_STATUSES) {
    for (const to of CHALLENGE_STATUSES) {
      const permitted = TRANSITIONS.some(([f, t]) => f === from && t === to);
      test(`${from} ${permitted ? 'may' : 'may not'} become ${to}`, () => {
        const challenge = challengeOf(from);
        if (permitted) {
          assert.doesNotThrow(() => requireTransition(challenge, to));
        } else {
          assert.throws(() => requireTransition(challenge, to), conflict);
        }
      });
    }
  }

  // Rule 33 is the lifecycle, not a permission: the claim does not reopen it.
  test('a superadmin cannot move a challenge backwards', () => {
    assert.throws(
      () => requireTransition(challengeOf('complete'), 'active'),
      conflict,
    );
  });
});

/** Rules 18 and 20, transcribed: strictly lower rank, so owner-on-owner fails. */
const REMOVABLE: Record<MemberRole, MemberRole[]> = {
  owner: ['admin', 'member'],
  admin: ['member'],
  member: [],
};

describe('requireRemoval', () => {
  for (const role of MEMBER_ROLES) {
    for (const target of MEMBER_ROLES) {
      const permitted = REMOVABLE[role].includes(target);
      test(`an ${role} ${permitted ? 'may' : 'may not'} remove a ${target}`, () => {
        const actor = { role, superadmin: false };
        if (permitted) {
          assert.doesNotThrow(() => requireRemoval(actor, target));
        } else {
          assert.throws(() => requireRemoval(actor, target), forbidden);
        }
      });
    }

    // Rule 41: superadmin ranks above owner.
    test(`a superadmin may remove an ${role}`, () => {
      assert.doesNotThrow(() => requireRemoval(superadmin, role));
    });

    test(`an outsider removing an ${role} gets not-found`, () => {
      assert.throws(() => requireRemoval(outsider, role), notFound);
    });
  }
});

/**
 * Rules 18 and 19, transcribed as `[actor, current, new]`: outrank who they
 * are, grant no higher than yourself. A member holds no `member.setRole`.
 */
const GRANTS: [MemberRole, MemberRole, MemberRole][] = [
  ['admin', 'member', 'member'],
  ['admin', 'member', 'admin'],
  ['owner', 'member', 'member'],
  ['owner', 'member', 'admin'],
  ['owner', 'member', 'owner'],
  ['owner', 'admin', 'member'],
  ['owner', 'admin', 'admin'],
  ['owner', 'admin', 'owner'],
];

/** Rule 20: promotion is never self-service, and an owner steps down on their own. */
const SELF_DEMOTIONS: [MemberRole, MemberRole][] = [
  ['owner', 'admin'],
  ['owner', 'member'],
  ['admin', 'member'],
];

describe('requireRoleChange', () => {
  for (const role of MEMBER_ROLES) {
    for (const current of MEMBER_ROLES) {
      for (const next of MEMBER_ROLES) {
        const permitted = GRANTS.some(
          ([a, c, n]) => a === role && c === current && n === next,
        );
        test(`an ${role} ${permitted ? 'may' : 'may not'} make a ${current} a ${next}`, () => {
          const actor = { role, superadmin: false };
          if (permitted) {
            assert.doesNotThrow(() =>
              requireRoleChange(actor, false, current, next),
            );
          } else {
            assert.throws(
              () => requireRoleChange(actor, false, current, next),
              forbidden,
            );
          }
        });
      }
    }
  }

  for (const current of MEMBER_ROLES) {
    for (const next of MEMBER_ROLES) {
      const permitted = SELF_DEMOTIONS.some(
        ([c, n]) => c === current && n === next,
      );
      test(`a ${current} ${permitted ? 'may' : 'may not'} make themselves a ${next}`, () => {
        const actor = { role: current, superadmin: false };
        if (permitted) {
          assert.doesNotThrow(() =>
            requireRoleChange(actor, true, current, next),
          );
        } else {
          assert.throws(
            () => requireRoleChange(actor, true, current, next),
            forbidden,
          );
        }
      });
    }
  }

  // Rule 41: superadmin passes both rank rules, including owner-on-owner.
  test('a superadmin may promote an owner', () => {
    assert.doesNotThrow(() =>
      requireRoleChange(superadmin, false, 'owner', 'owner'),
    );
  });

  test('an outsider gets not-found on either path', () => {
    assert.throws(
      () => requireRoleChange(outsider, false, 'member', 'admin'),
      notFound,
    );
    assert.throws(
      () => requireRoleChange(outsider, true, 'member', 'member'),
      notFound,
    );
  });
});

describe('requireOwnReadingWrite', () => {
  for (const role of MEMBER_ROLES) {
    test(`an active ${role} may write their own reading`, () => {
      assert.doesNotThrow(() =>
        requireOwnReadingWrite({ role, superadmin: false }),
      );
    });
  }

  test('an outsider gets not-found', () => {
    assert.throws(() => requireOwnReadingWrite(outsider), notFound);
  });
});

/** Rule 18 again, for the author of the reading rather than a membership row. */
describe('requireOthersReadingWrite', () => {
  for (const role of MEMBER_ROLES) {
    for (const author of MEMBER_ROLES) {
      const permitted = REMOVABLE[role].includes(author);
      test(`an ${role} ${permitted ? 'may' : 'may not'} edit a ${author}'s reading`, () => {
        const actor = { role, superadmin: false };
        if (permitted) {
          assert.doesNotThrow(() => requireOthersReadingWrite(actor, author));
        } else {
          assert.throws(
            () => requireOthersReadingWrite(actor, author),
            forbidden,
          );
        }
      });
    }

    test(`a superadmin may edit an ${role}'s reading`, () => {
      assert.doesNotThrow(() => requireOthersReadingWrite(superadmin, role));
    });
  }

  test('an outsider gets not-found', () => {
    assert.throws(
      () => requireOthersReadingWrite(outsider, 'member'),
      notFound,
    );
  });
});

describe('requireAnotherOwner', () => {
  // Rule 21: the last active owner cannot leave or step down.
  test('rejects the only owner', () => {
    assert.throws(() => requireAnotherOwner(['u1'], 'u1'), conflict);
  });

  test('allows an owner with a second owner present', () => {
    assert.doesNotThrow(() => requireAnotherOwner(['u1', 'u2'], 'u1'));
  });

  test('allows a non-owner while one owner remains', () => {
    assert.doesNotThrow(() => requireAnotherOwner(['u1'], 'u2'));
  });

  // Rule 42: superadmin holds no row, so the list can be empty of the caller.
  test('allows a caller absent from the owner list', () => {
    assert.doesNotThrow(() => requireAnotherOwner([], 'u1'));
  });
});

describe('requireJoinable', () => {
  const draft = challengeOf('draft');
  const active = challengeOf('active');

  test('a newcomer joins a draft challenge', () => {
    assert.equal(requireJoinable(draft, undefined), 'join');
  });

  test('a newcomer joins an active challenge', () => {
    assert.equal(requireJoinable(active, undefined), 'join');
  });

  // Rule 25: a `left` member rejoins with a valid code.
  test('a left member rejoins', () => {
    assert.equal(
      requireJoinable(active, membershipOf('member', 'left')),
      'join',
    );
  });

  // Rule 31: joining twice is a no-op, not an error.
  test('an active member is already in', () => {
    assert.equal(
      requireJoinable(active, membershipOf('member')),
      'already-active',
    );
  });

  // Rule 26: `removed` is permanent until a superadmin reinstates.
  test('a removed member is refused', () => {
    assert.throws(
      () => requireJoinable(active, membershipOf('member', 'removed')),
      forbidden,
    );
  });

  // Rule 36: the lifecycle answers before the membership does.
  test('a complete challenge refuses everyone with a conflict', () => {
    const complete = challengeOf('complete');
    assert.throws(() => requireJoinable(complete, undefined), conflict);
    assert.throws(
      () => requireJoinable(complete, membershipOf('member', 'removed')),
      conflict,
    );
  });
});
