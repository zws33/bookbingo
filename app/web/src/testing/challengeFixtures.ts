import type {
  Challenge,
  ChallengeSummary,
  Member,
  Membership,
} from '../types/challenges';

export function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'ch-1',
    name: '2026 Book Bingo',
    status: 'active',
    tagCap: 3,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-02'),
    ...overrides,
  };
}

export function makeMembership(
  overrides: Partial<Membership> = {},
): Membership {
  return {
    userId: 'user-1',
    role: 'member',
    status: 'active',
    joinedAt: new Date('2026-01-03'),
    ...overrides,
  };
}

export function makeSummary(
  challenge: Partial<Challenge> = {},
  membership: Partial<Membership> = {},
): ChallengeSummary {
  return {
    challenge: makeChallenge(challenge),
    membership: makeMembership(membership),
  };
}

export function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    ...makeMembership(),
    displayName: 'Dana Whitfield',
    photoURL: null,
    ...overrides,
  };
}
