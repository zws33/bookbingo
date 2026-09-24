import {
  FieldValue,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { DomainError } from '../common/errors.js';
import { isNotFound, mapValid } from '../common/firestoreHelpers.js';
import { db } from '../firebase.js';
import {
  ChallengeDocSchema,
  MembershipDocSchema,
  type ChallengeStatus,
  type MemberRole,
  type MembershipStatus,
} from './schema.js';

export interface Challenge {
  id: string;
  name: string;
  status: ChallengeStatus;
  tagCap: number;
  createdBy: string;
  createdAt: Date;
}

export function toChallenge(doc: DocumentSnapshot): Challenge {
  const data = ChallengeDocSchema.parse(doc.data());
  return {
    id: doc.id,
    name: data.name,
    status: data.status,
    tagCap: data.tagCap,
    createdBy: data.createdBy,
    createdAt: data.createdAt,
  };
}

export interface Membership {
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: Date;
}

export function toMembership(doc: DocumentSnapshot): Membership {
  const data = MembershipDocSchema.parse(doc.data());
  return {
    userId: doc.id,
    role: data.role,
    status: data.status,
    joinedAt: data.joinedAt,
  };
}

/**
 * Keyed by the challenge id in each document's path: a collection-group read
 * carries no challenge id of its own, and a user holds at most one member doc
 * per challenge.
 */
export function membershipsByChallenge(
  docs: QueryDocumentSnapshot[],
): Map<string, Membership> {
  const byChallenge = new Map<string, Membership>();

  for (const doc of docs) {
    const challengeId = doc.ref.parent.parent?.id;
    if (!challengeId) continue;

    const [membership] = mapValid('members', [doc], toMembership);
    if (membership) byChallenge.set(challengeId, membership);
  }

  return byChallenge;
}

function challengeCollection() {
  return db.collection('challenges');
}

function challengeDoc(cid: string) {
  return challengeCollection().doc(cid);
}

function membersCollection(cid: string) {
  return challengeDoc(cid).collection('members');
}

function memberDoc(cid: string, userId: string) {
  return membersCollection(cid).doc(userId);
}

export interface ChallengeFields {
  name: string;
  tagCap: number;
}

export interface ChallengeRepository {
  get(challengeId: string): Promise<Challenge>;
  create(userId: string, fields: ChallengeFields): Promise<string>;
  update(challengeId: string, fields: ChallengeFields): Promise<void>;
  setChallengeStatus(
    challengeId: string,
    status: ChallengeStatus,
  ): Promise<void>;
  remove(challengeId: string): Promise<void>;
  getMembership(
    challengeId: string,
    userId: string,
  ): Promise<Membership | undefined>;
  listActiveMemberships(userId: string): Promise<Map<string, Membership>>;
}

const firestoreChallenges: ChallengeRepository = {
  async get(challengeId) {
    const doc = await challengeDoc(challengeId).get();
    if (!doc.exists) {
      throw new DomainError('not-found', 'That challenge no longer exists');
    }
    return toChallenge(doc);
  },
  async create(userId, { name, tagCap }) {
    const ref = challengeCollection().doc();
    await ref.create({
      name,
      tagCap,
      status: 'draft' satisfies ChallengeStatus,
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async update(challengeId, { name, tagCap }) {
    try {
      await challengeDoc(challengeId).update({
        name,
        tagCap,
      });
    } catch (error) {
      if (isNotFound(error)) {
        throw new DomainError('not-found', 'That challenge no longer exists.');
      }
      throw error;
    }
  },
  async setChallengeStatus(challengeId, status) {
    try {
      await challengeDoc(challengeId).update({ status });
    } catch (error) {
      if (isNotFound(error)) {
        throw new DomainError('not-found', 'That challenge no longer exists.');
      }
      throw error;
    }
  },
  async remove(challengeId) {
    await challengeDoc(challengeId).delete();
  },

  // Absent and non-`active` are the same answer to the caller (rule 14), so
  // both are left for the guard to reject rather than thrown on here.
  async getMembership(challengeId, userId) {
    const doc = await memberDoc(challengeId, userId).get();
    if (!doc.exists) return undefined;
    return toMembership(doc);
  },

  // A collection group cannot filter on the document key, so the stored
  // `userId` field is the only way to select one user's member docs.
  async listActiveMemberships(userId) {
    const snapshot = await db
      .collectionGroup('members')
      .where('userId', '==', userId)
      .where('status', '==', 'active' satisfies MembershipStatus)
      .get();
    return membershipsByChallenge(snapshot.docs);
  },
};

export function challengeRepository(): ChallengeRepository {
  return firestoreChallenges;
}
