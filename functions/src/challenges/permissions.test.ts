import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  MAX_CHALLENGES_CREATED,
  PERMISSIONS,
  hasPermission,
  canEditOthersReading,
  canGrant,
  canRemove,
  canSelfDemote,
  canSetRole,
  canTransition,
  statusAllows,
  CHALLENGE_ACTIONS,
  type ChallengeAction,
  exceedsCreationCap,
  isSuperadmin,
  outranks,
  rankOf,
  type Permission,
} from './permissions.js';
import {
  CHALLENGE_STATUSES,
  MEMBER_ROLES,
  type ChallengeStatus,
  type MemberRole,
} from './schema.js';

const owner = { role: 'owner' as const, superadmin: false };
const admin = { role: 'admin' as const, superadmin: false };
const member = { role: 'member' as const, superadmin: false };
const outsider = { role: undefined, superadmin: false };
const superadmin = { role: undefined, superadmin: true };

/** Transcribed from the spec, not from `MINIMUM_ROLE`: deriving it would assert nothing. */
const GRANTED: Record<Permission, MemberRole[]> = {
  'challenge.read': ['owner', 'admin', 'member'],
  'reading.write.own': ['owner', 'admin', 'member'],
  'reading.write.any': ['owner', 'admin'],
  'member.remove': ['owner', 'admin'],
  'member.setRole': ['owner', 'admin'],
  'joinCode.manage': ['owner', 'admin'],
  'tag.crud': ['owner', 'admin'],
  'config.edit': ['owner', 'admin'],
  'status.change': ['owner'],
  'challenge.delete': ['owner'],
};

describe('can', () => {
  for (const permission of PERMISSIONS) {
    for (const role of MEMBER_ROLES) {
      const expected = GRANTED[permission].includes(role);
      test(`${role} ${expected ? 'holds' : 'does not hold'} ${permission}`, () => {
        assert.equal(
          hasPermission({ role, superadmin: false }, permission),
          expected,
        );
      });
    }

    test(`a non-member does not hold ${permission}`, () => {
      assert.equal(hasPermission(outsider, permission), false);
    });

    test(`a superadmin holds ${permission}`, () => {
      assert.equal(hasPermission(superadmin, permission), true);
    });
  }
});

describe('rankOf', () => {
  test('orders superadmin above owner above admin above member', () => {
    assert.ok(rankOf(superadmin) > rankOf(owner));
    assert.ok(rankOf(owner) > rankOf(admin));
    assert.ok(rankOf(admin) > rankOf(member));
  });

  test('puts a non-member below every role', () => {
    assert.ok(rankOf(outsider) < rankOf(member));
  });

  test('the superadmin claim wins over a stored role', () => {
    assert.equal(
      rankOf({ role: 'member', superadmin: true }),
      rankOf(superadmin),
    );
  });
});

describe('outranks', () => {
  test('is strict, so an owner does not outrank another owner', () => {
    assert.equal(outranks(owner, 'owner'), false);
  });

  test('an owner outranks an admin and a member', () => {
    assert.ok(outranks(owner, 'admin'));
    assert.ok(outranks(owner, 'member'));
  });

  test('an admin outranks only a member', () => {
    assert.equal(outranks(admin, 'owner'), false);
    assert.equal(outranks(admin, 'admin'), false);
    assert.ok(outranks(admin, 'member'));
  });

  test('a superadmin outranks an owner', () => {
    assert.ok(outranks(superadmin, 'owner'));
  });

  test('a non-member outranks nobody', () => {
    for (const role of MEMBER_ROLES) {
      assert.equal(outranks(outsider, role), false);
    }
  });
});

describe('canGrant', () => {
  test('an owner may grant owner, its own role', () => {
    assert.ok(canGrant(owner, 'owner'));
  });

  test('an admin may grant admin but not owner', () => {
    assert.ok(canGrant(admin, 'admin'));
    assert.equal(canGrant(admin, 'owner'), false);
  });

  test('a member may grant nothing', () => {
    for (const role of MEMBER_ROLES) {
      assert.equal(canGrant(member, role), false);
    }
  });
});

describe('canSetRole', () => {
  test('an owner promotes a member to owner', () => {
    assert.ok(canSetRole(owner, 'member', 'owner'));
  });

  test('an owner cannot demote another owner', () => {
    assert.equal(canSetRole(owner, 'owner', 'member'), false);
  });

  test('an admin promotes a member to admin', () => {
    assert.ok(canSetRole(admin, 'member', 'admin'));
  });

  test('an admin cannot promote a member to owner', () => {
    assert.equal(canSetRole(admin, 'member', 'owner'), false);
  });

  test('an admin cannot change another admin', () => {
    assert.equal(canSetRole(admin, 'admin', 'member'), false);
  });

  test('a member cannot change anyone', () => {
    assert.equal(canSetRole(member, 'member', 'admin'), false);
  });

  test('a superadmin demotes an owner', () => {
    assert.ok(canSetRole(superadmin, 'owner', 'member'));
  });
});

describe('canSelfDemote', () => {
  test('an owner may step down to admin or member', () => {
    assert.ok(canSelfDemote('owner', 'admin'));
    assert.ok(canSelfDemote('owner', 'member'));
  });

  test('promotion is not self-service', () => {
    assert.equal(canSelfDemote('member', 'owner'), false);
    assert.equal(canSelfDemote('admin', 'owner'), false);
  });

  test('a no-op is not a demotion', () => {
    assert.equal(canSelfDemote('owner', 'owner'), false);
  });
});

describe('canRemove', () => {
  test('an admin removes a member but not another admin', () => {
    assert.ok(canRemove(admin, 'member'));
    assert.equal(canRemove(admin, 'admin'), false);
  });

  test('an owner cannot remove another owner', () => {
    assert.equal(canRemove(owner, 'owner'), false);
  });

  test('a member removes nobody', () => {
    assert.equal(canRemove(member, 'member'), false);
  });

  test('a superadmin removes an owner', () => {
    assert.ok(canRemove(superadmin, 'owner'));
  });
});

describe('canEditOthersReading', () => {
  test('an admin cannot edit an owner’s reading', () => {
    assert.equal(canEditOthersReading(admin, 'owner'), false);
  });

  test('an admin edits a member’s reading', () => {
    assert.ok(canEditOthersReading(admin, 'member'));
  });

  test('a member edits nobody else’s reading', () => {
    assert.equal(canEditOthersReading(member, 'member'), false);
  });
});

describe('exceedsCreationCap', () => {
  test('allows the create that reaches the cap', () => {
    assert.equal(exceedsCreationCap(member, MAX_CHALLENGES_CREATED - 1), false);
  });

  test('rejects the create after the cap', () => {
    assert.ok(exceedsCreationCap(member, MAX_CHALLENGES_CREATED));
  });

  test('a count above the cap stays rejected, so deleting frees no slot', () => {
    assert.ok(exceedsCreationCap(member, MAX_CHALLENGES_CREATED + 3));
  });

  test('a superadmin is exempt', () => {
    assert.equal(
      exceedsCreationCap(superadmin, MAX_CHALLENGES_CREATED + 3),
      false,
    );
  });
});

describe('isSuperadmin', () => {
  test('reads the claim only when it is exactly true', () => {
    assert.ok(isSuperadmin({ superadmin: true }));
    assert.equal(isSuperadmin({ superadmin: 'true' }), false);
    assert.equal(isSuperadmin({ superadmin: 1 }), false);
    assert.equal(isSuperadmin({}), false);
  });
});

/** Transcribed from the spec, not from `STATUS_ALLOWS`, for the same reason. */
const ALLOWED: Record<ChallengeStatus, ChallengeAction[]> = {
  draft: ['join', 'configEdit', 'rename', 'memberManage', 'delete'],
  active: ['join', 'readingWrite', 'rename', 'memberManage', 'delete'],
  complete: ['delete'],
};

describe('statusAllows', () => {
  for (const status of CHALLENGE_STATUSES) {
    for (const action of CHALLENGE_ACTIONS) {
      const expected = ALLOWED[status].includes(action);
      test(`${status} ${expected ? 'permits' : 'rejects'} ${action}`, () => {
        assert.equal(statusAllows(status, action), expected);
      });
    }
  }

  test('a draft takes no readings, so the board is set before play', () => {
    assert.equal(statusAllows('draft', 'readingWrite'), false);
  });

  test('going active locks the config but not the name', () => {
    assert.equal(statusAllows('active', 'configEdit'), false);
    assert.ok(statusAllows('active', 'rename'));
  });

  test('a complete challenge can still be deleted', () => {
    assert.ok(statusAllows('complete', 'delete'));
  });
});

describe('canTransition', () => {
  test('follows the chain forward one step at a time', () => {
    assert.ok(canTransition('draft', 'active'));
    assert.ok(canTransition('active', 'complete'));
  });

  test('cannot skip active', () => {
    assert.equal(canTransition('draft', 'complete'), false);
  });

  test('cannot move backward', () => {
    assert.equal(canTransition('active', 'draft'), false);
    assert.equal(canTransition('complete', 'active'), false);
  });

  test('complete is terminal', () => {
    for (const status of CHALLENGE_STATUSES) {
      assert.equal(canTransition('complete', status), false);
    }
  });

  test('a status does not transition to itself', () => {
    for (const status of CHALLENGE_STATUSES) {
      assert.equal(canTransition(status, status), false);
    }
  });
});
