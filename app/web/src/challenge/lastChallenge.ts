const KEY = 'bookbingo.lastChallengeId';

/**
 * A hint, never a source of truth: it is validated against the fetched
 * membership list on every use, so a challenge you were removed from
 * degrades to the chooser instead of a dead route.
 *
 * Storage throws in Safari's private mode, which is not worth failing a
 * sign-in over.
 */
export function readLastChallengeId(): string | undefined {
  try {
    return window.localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLastChallengeId(challengeId: string): void {
  try {
    window.localStorage.setItem(KEY, challengeId);
  } catch {
    // Ignored: the resolver falls back to the chooser.
  }
}
