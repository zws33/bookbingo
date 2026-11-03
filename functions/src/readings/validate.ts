import { DomainError } from '../common/errors.js';

/**
 * The rules for a reading whose tags the database validates.
 *
 * No catalog: an unknown tag fails `reading_tags_tag_id_challenge_id_fkey` on
 * insert, so checking the vocabulary here would cost a query to reach the same
 * rejection. What the constraints cannot express is the cap, which exempts a
 * freebie, and the duplicate check, which has to run before the insert so the
 * message names the cause rather than a primary key.
 */
export function validateDistinctTags(tagIds: string[]): void {
  if (new Set(tagIds).size !== tagIds.length) {
    throw new DomainError(
      'invalid-input',
      'A tag list cannot use the same tag twice.',
    );
  }
}

export function validateReadingTags(
  tagIds: string[],
  isFreebie: boolean,
  maxTags: number,
): void {
  validateDistinctTags(tagIds);

  if (!isFreebie && tagIds.length > maxTags) {
    throw new DomainError(
      'invalid-input',
      `A reading can use at most ${maxTags} tags unless it is a freebie.`,
    );
  }

  if (isFreebie && tagIds.length === 0) {
    throw new DomainError(
      'invalid-input',
      'A freebie reading must use at least one tag.',
    );
  }
}
