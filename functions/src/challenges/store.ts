import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { DomainError } from '../common/errors.js';
import { isNotFound } from '../common/firestoreHelpers.js';
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
function challengeCollection() {
  return db.collection('challenges');
}

function challengeDoc(cid: string) {
  return challengeCollection().doc(cid);
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
};

export function challengeRepository(): ChallengeRepository {
  return firestoreChallenges;
}
