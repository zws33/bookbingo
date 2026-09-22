import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import { TILES } from '../domain/constants.js';
import { MAX_TILES_PER_BOOK } from '../domain/validation.js';
import { getScoreBreakdown } from '../domain/scoring.js';

const TILE_IDS = new Set(TILES.map((tile) => tile.id));

/**
 * Tiles must be real and distinct. Applies to any tile list, planned or read.
 *
 * The client only offers catalog tiles, but that is a convenience for the
 * person typing. Once the security rules deny direct writes, this is the only
 * thing that decides what a tile list may contain.
 */
export function validateTileIds(tiles: string[]): void {
  const unknown = tiles.filter((tile) => !TILE_IDS.has(tile));
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
 * The rules for a reading: real, distinct tiles, and at most
 * `MAX_TILES_PER_BOOK` of them unless the reading is a freebie.
 *
 * A planned TBR entry uses `validateTileIds` instead — the cap applies when
 * the plan becomes a reading, not while it is still a plan.
 */
export function validateReadingTiles(
  tiles: string[],
  isFreebie: boolean,
): void {
  validateTileIds(tiles);

  if (!isFreebie && tiles.length > MAX_TILES_PER_BOOK) {
    throw new DomainError(
      'invalid-input',
      `A reading can use at most ${MAX_TILES_PER_BOOK} tiles unless it is a freebie.`,
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
  balanceFactor: number;
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
    balanceFactor: breakdown.balanceFactor,
    tileCounts: Object.fromEntries(breakdown.tileCounts),
    totalBooks: breakdown.totalBooks,
  };
}
