import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import { getScoreBreakdown } from '../domain/scoring.js';

/**
 * Tiles must be real and distinct. Applies to any tile list, planned or read.
 *
 * The client only offers catalog tiles, but that is a convenience for the
 * person typing. Once the security rules deny direct writes, this is the only
 * thing that decides what a tile list may contain.
 *
 * `validIds` is a parameter rather than the global catalog because the
 * vocabulary becomes per-challenge.
 */
export function validateTileIds(
  tiles: string[],
  validIds: ReadonlySet<string>,
): void {
  const unknown = tiles.filter((tile) => !validIds.has(tile));
  if (unknown.length > 0) {
    throw new DomainError(
      'invalid-input',
      `Unknown tile: ${unknown.join(', ')}.`,
    );
  }

  if (new Set(tiles).size !== tiles.length) {
    throw new DomainError(
      'invalid-input',
      'A tile list cannot use the same tile twice.',
    );
  }
}

/**
 * The rules for a reading: real, distinct tiles, at most `maxTiles` of them
 * unless the reading is a freebie, and at least one if it is.
 *
 * A planned TBR entry uses `validateTileIds` instead — the cap applies when
 * the plan becomes a reading, not while it is still a plan.
 */
export function validateReadingTiles(
  tiles: string[],
  isFreebie: boolean,
  validIds: ReadonlySet<string>,
  maxTiles: number,
): void {
  validateTileIds(tiles, validIds);

  if (!isFreebie && tiles.length > maxTiles) {
    throw new DomainError(
      'invalid-input',
      `A reading can use at most ${maxTiles} tiles unless it is a freebie.`,
    );
  }

  if (isFreebie && tiles.length === 0) {
    throw new DomainError(
      'invalid-input',
      'A freebie reading must use at least one tile.',
    );
  }
}

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

/**
 * The score breakdown as the API returns it.
 *
 * `tileCounts` is a Record, not the domain's Map: JSON has no Map, and an
 * encoded one arrives as `{}`.
 */
export interface ScoreDTO {
  score: number;
  varietyPoints: number;
  volumePoints: number;
  tileCounts: Record<string, number>;
  totalBooks: number;
}

export function scoreOf(readings: ScoringInput[]): ScoreDTO {
  return toScoreDTO(getScoreBreakdown(readings));
}

function toScoreDTO(breakdown: ScoreBreakdown): ScoreDTO {
  return {
    score: breakdown.score,
    varietyPoints: breakdown.varietyPoints,
    volumePoints: breakdown.volumePoints,
    tileCounts: Object.fromEntries(breakdown.tileCounts),
    totalBooks: breakdown.totalBooks,
  };
}
