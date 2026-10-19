import type {
  Challenge,
  ChallengeDetail,
  ChallengeSummary,
  MemberRole,
  Member,
} from '../types/challenges';

/**
 * Stands in for the challenge callables, which are not wired yet: the handlers
 * exist for `create`, `get` and `updateConfig` and nothing is registered in
 * `functions/src/index.ts`. Every export here matches the signature its
 * callable will have, so wiring is a swap of this module for one built on
 * `createCallable`.
 *
 * The store is mutable so create and join actually change what the list read
 * returns and the flows can be walked end to end.
 */

/** The signed-in user, from the UI's point of view. Real memberships key on the Firebase uid. */
export const MOCK_UID = 'me';

const MOCK_DELAY_MS = 180;

/**
 * `?mock=` picks the starting state so the empty and single-membership paths
 * are reachable in the browser without editing this file.
 */
export type MockScenario = 'none' | 'one' | 'many';

function readScenario(): MockScenario {
  const requested = new URLSearchParams(window.location.search).get('mock');
  return requested === 'none' || requested === 'one' ? requested : 'many';
}

function instant(iso: string): Date {
  return new Date(iso);
}

function member(
  userId: string,
  displayName: string,
  role: MemberRole,
  joinedAt: string,
): Member {
  return {
    userId,
    displayName,
    photoURL: null,
    role,
    status: 'active',
    joinedAt: instant(joinedAt),
  };
}

const ROSTERS: Record<string, Member[]> = {
  'ch-2026-main': [
    member(MOCK_UID, 'You', 'owner', '2026-01-02T10:00:00Z'),
    member('u-dana', 'Dana Whitfield', 'admin', '2026-01-03T09:12:00Z'),
    member('u-priya', 'Priya Raghunathan', 'member', '2026-01-04T17:40:00Z'),
    member('u-marcus', 'Marcus Oyelaran', 'member', '2026-01-08T21:05:00Z'),
    member('u-jo', 'Jo Bergström', 'member', '2026-02-11T08:30:00Z'),
  ],
  'ch-2025-main': [
    member(MOCK_UID, 'You', 'member', '2025-01-05T12:00:00Z'),
    member('u-dana', 'Dana Whitfield', 'owner', '2025-01-01T12:00:00Z'),
    member('u-priya', 'Priya Raghunathan', 'member', '2025-01-06T12:00:00Z'),
  ],
  'ch-shortstories': [
    member(MOCK_UID, 'You', 'admin', '2026-09-30T19:00:00Z'),
    member('u-marcus', 'Marcus Oyelaran', 'owner', '2026-09-29T19:00:00Z'),
  ],
};

const CHALLENGES: Challenge[] = [
  {
    id: 'ch-2026-main',
    name: '2026 Book Bingo',
    status: 'active',
    tagCap: 3,
    createdBy: MOCK_UID,
    createdAt: instant('2026-01-02T10:00:00Z'),
  },
  {
    id: 'ch-shortstories',
    name: 'Short Story Autumn',
    status: 'draft',
    tagCap: 2,
    createdBy: 'u-marcus',
    createdAt: instant('2026-09-29T19:00:00Z'),
  },
  {
    id: 'ch-2025-main',
    name: '2025 Book Bingo',
    status: 'complete',
    tagCap: 3,
    createdBy: 'u-dana',
    createdAt: instant('2025-01-01T12:00:00Z'),
  },
];

function scenarioChallenges(scenario: MockScenario): Challenge[] {
  if (scenario === 'none') return [];
  if (scenario === 'one') return CHALLENGES.slice(0, 1);
  return CHALLENGES;
}

const store = {
  challenges: scenarioChallenges(readScenario()),
  rosters: { ...ROSTERS },
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), MOCK_DELAY_MS);
  });
}

function reject(message: string): Promise<never> {
  return new Promise((_resolve, rejectPromise) => {
    setTimeout(() => rejectPromise(new Error(message)), MOCK_DELAY_MS);
  });
}

function myMembership(challengeId: string): Member | undefined {
  return store.rosters[challengeId]?.find(
    (entry) => entry.userId === MOCK_UID && entry.status === 'active',
  );
}

/**
 * Ordered the way the switcher reads: live challenges first, finished ones
 * last, newest first inside each group.
 */
const STATUS_ORDER = { active: 0, draft: 1, complete: 2 } as const;

export function listMyChallenges(): Promise<ChallengeSummary[]> {
  const summaries = store.challenges
    .flatMap((challenge) => {
      const membership = myMembership(challenge.id);
      return membership ? [{ challenge, membership }] : [];
    })
    .sort((a, b) => {
      const byStatus =
        STATUS_ORDER[a.challenge.status] - STATUS_ORDER[b.challenge.status];
      return byStatus !== 0
        ? byStatus
        : b.challenge.createdAt.getTime() - a.challenge.createdAt.getTime();
    });

  return delay(summaries);
}

/** `not-found` covers both a missing challenge and a non-member, as the handler does. */
export function getChallenge(challengeId: string): Promise<ChallengeDetail> {
  const challenge = store.challenges.find((entry) => entry.id === challengeId);
  if (!challenge || !myMembership(challengeId)) {
    return reject('That challenge does not exist.');
  }

  return delay({
    challenge,
    members: (store.rosters[challengeId] ?? []).filter(
      (entry) => entry.status === 'active',
    ),
  });
}

export function createChallenge(input: {
  name: string;
  tagCap: number;
}): Promise<{ challengeId: string; joinCode: string }> {
  const challengeId = `ch-${Date.now().toString(36)}`;

  store.challenges = [
    {
      id: challengeId,
      name: input.name,
      status: 'draft',
      tagCap: input.tagCap,
      createdBy: MOCK_UID,
      createdAt: new Date(),
    },
    ...store.challenges,
  ];
  store.rosters[challengeId] = [
    member(MOCK_UID, 'You', 'owner', new Date().toISOString()),
  ];

  return delay({ challengeId, joinCode: 'MOCK-1234' });
}

/** The one code the mock accepts, so the rejected path is reachable too. */
export const MOCK_JOIN_CODE = 'BNG02026';

export function joinChallenge(code: string): Promise<{ challengeId: string }> {
  if (code.toUpperCase() !== MOCK_JOIN_CODE) {
    return reject('No challenge matches that code.');
  }

  const challengeId = 'ch-2026-main';
  const joined = CHALLENGES.find((entry) => entry.id === challengeId);
  if (joined && !store.challenges.some((entry) => entry.id === challengeId)) {
    store.challenges = [joined, ...store.challenges];
  }
  if (!myMembership(challengeId)) {
    store.rosters[challengeId] = [
      ...(store.rosters[challengeId] ?? []),
      member(MOCK_UID, 'You', 'member', new Date().toISOString()),
    ];
  }

  return delay({ challengeId });
}

export function updateChallengeConfig(input: {
  challengeId: string;
  name?: string;
  tagCap?: number;
}): Promise<void> {
  store.challenges = store.challenges.map((challenge) =>
    challenge.id === input.challengeId
      ? {
          ...challenge,
          name: input.name ?? challenge.name,
          tagCap: input.tagCap ?? challenge.tagCap,
        }
      : challenge,
  );

  return delay(undefined);
}

export function leaveChallenge(challengeId: string): Promise<void> {
  store.rosters[challengeId] = (store.rosters[challengeId] ?? []).map(
    (entry) =>
      entry.userId === MOCK_UID ? { ...entry, status: 'left' as const } : entry,
  );

  return delay(undefined);
}
