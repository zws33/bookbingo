import { randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so a code survives being read aloud. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const JOIN_CODE_LENGTH = 6;

/** Rule 17. */
export const JOIN_CODE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Rule 16, at 30 bits.
 *
 * One byte per character, masked to the low 5 bits. 256 is a whole multiple of
 * 32, so every character has the same number of byte values behind it and the
 * mask is already uniform — an alphabet that was not a power of two would need
 * rejection sampling here instead.
 *
 * Uniqueness is the store's job: codes are written with `create`, which fails
 * on an id that already exists.
 */
export function generateJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET.charAt(byte & 31)).join('');
}

/**
 * Folds the substitutions Crockford's alphabet is chosen for: a code is read
 * off a screen and typed by someone else, so O/0 and I/L/1 are the mistakes it
 * expects. Separators and case are dropped for the same reason.
 *
 * Nothing validates the result — an unknown code is `not-found` on lookup
 * (rule 18), which is also the answer for a revoked one.
 */
export function normalizeJoinCode(input: string): string {
  return input
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** Rule 17: 72h from creation, computed where the TTL is defined. */
export function expiresAtFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + JOIN_CODE_TTL_MS);
}

/**
 * Handlers check this even though a TTL policy deletes expired documents:
 * Firestore's deletion runs on its own schedule, so an expired code stays
 * readable for a while after it stops being valid.
 */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
