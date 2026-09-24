import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { membershipsByChallenge, toChallenge, toMembership } from './store.js';

const CREATED_AT = new Date('2026-01-02T03:04:05Z');

/** Stands in for an admin Timestamp: `toDate()` is all the schema requires. */
const timestamp = (date: Date) => ({ toDate: () => date });

function makeDoc(id: string, data: unknown): QueryDocumentSnapshot {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe('toChallenge', () => {
  const stored = {
    name: 'Summer 2026',
    tagCap: 3,
    status: 'draft',
    createdAt: timestamp(CREATED_AT),
    createdBy: 'user-1',
  };

  test('maps a stored challenge to its API shape', () => {
    assert.deepEqual(toChallenge(makeDoc('challenge-1', stored)), {
      id: 'challenge-1',
      name: 'Summer 2026',
      status: 'draft',
      tagCap: 3,
      createdBy: 'user-1',
      createdAt: CREATED_AT,
    });
  });

  test('does not expose stored fields missing from the API type', () => {
    const challenge = toChallenge(
      makeDoc('challenge-1', { ...stored, internalNote: 'secret' }),
    );
    assert.equal('internalNote' in challenge, false);
  });

  test('throws on an invalid document', () => {
    assert.throws(() =>
      toChallenge(makeDoc('challenge-1', { ...stored, status: 'archived' })),
    );
  });
});

describe('toMembership', () => {
  const stored = {
    userId: 'user-1',
    role: 'admin',
    status: 'left',
    joinedAt: timestamp(CREATED_AT),
  };

  test('maps a stored membership to its API shape', () => {
    assert.deepEqual(toMembership(makeDoc('user-1', stored)), {
      userId: 'user-1',
      role: 'admin',
      status: 'left',
      joinedAt: CREATED_AT,
    });
  });

  // The doc is fetched by path, so the key is the identity the caller asked
  // for. A stored field that disagrees would hand back another user's id.
  test('takes userId from the document key, not the stored field', () => {
    const membership = toMembership(
      makeDoc('user-1', { ...stored, userId: 'user-2' }),
    );
    assert.equal(membership.userId, 'user-1');
  });

  test('does not expose stored fields missing from the API type', () => {
    const membership = toMembership(
      makeDoc('user-1', { ...stored, internalNote: 'secret' }),
    );
    assert.equal('internalNote' in membership, false);
  });

  test('throws on an invalid document', () => {
    assert.throws(() =>
      toMembership(makeDoc('user-1', { ...stored, role: 'superadmin' })),
    );
  });
});

describe('membershipsByChallenge', () => {
  const stored = {
    userId: 'user-1',
    role: 'member',
    status: 'active',
    joinedAt: timestamp(CREATED_AT),
  };

  /** `/challenges/{cid}/members/{userId}`: the grandparent is the challenge. */
  function makeMemberDoc(
    challengeId: string | undefined,
    data: unknown,
  ): QueryDocumentSnapshot {
    return {
      id: 'user-1',
      data: () => data,
      ref: { parent: { parent: challengeId ? { id: challengeId } : null } },
    } as unknown as QueryDocumentSnapshot;
  }

  test('keys each membership by the challenge id in its path', () => {
    const byChallenge = membershipsByChallenge([
      makeMemberDoc('challenge-1', stored),
      makeMemberDoc('challenge-2', { ...stored, role: 'owner' }),
    ]);

    assert.deepEqual([...byChallenge.keys()], ['challenge-1', 'challenge-2']);
    assert.equal(byChallenge.get('challenge-2')?.role, 'owner');
  });

  // One malformed member doc must not blank a user's whole challenge list.
  test('drops an invalid document and keeps the rest', () => {
    const byChallenge = membershipsByChallenge([
      makeMemberDoc('challenge-1', { ...stored, status: 'banned' }),
      makeMemberDoc('challenge-2', stored),
    ]);

    assert.deepEqual([...byChallenge.keys()], ['challenge-2']);
  });

  test('drops a document with no parent challenge', () => {
    assert.equal(
      membershipsByChallenge([makeMemberDoc(undefined, stored)]).size,
      0,
    );
  });
});
