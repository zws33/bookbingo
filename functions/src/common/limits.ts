import { DomainError } from './errors.js';

/**
 * Ceilings, not pagination. Every one of these is far above what a real
 * challenge produces; they exist so a single call cannot read an unbounded
 * number of documents, which is the only cost control available while
 * `functions/` is the sole reader and `firestore.rules` is deny-all.
 */
export const MAX_READINGS_PER_USER = 500;
export const MAX_TBR_PER_USER = 500;
export const MAX_ACTIVE_MEMBERSHIPS = 100;

export const MAX_READINGS_SCAN = 10_000;
export const MAX_USERS_SCAN = 5_000;

/**
 * Callers fetch `cap + 1` documents and pass the result here. Truncating a
 * scan that feeds scoring would understate every score with no error, so an
 * over-cap read fails instead: `corrupt` is not forwarded to the caller and
 * names the collection only in the failure log.
 */
export function requireCompleteScan(
  collection: string,
  docs: readonly unknown[],
  cap: number,
): void {
  if (docs.length > cap) {
    throw new DomainError(
      'corrupt',
      `${collection} scan exceeded its ${cap} document cap`,
      { collection, cap },
    );
  }
}
