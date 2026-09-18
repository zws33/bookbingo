import { HttpsError } from 'firebase-functions/v2/https';
import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { TILES } from '../domain/constants.js';
import { MAX_TILES_PER_BOOK } from '../domain/validation.js';
import { getScoreBreakdown } from '../domain/scoring.js';

const TILE_IDS = new Set(TILES.map((tile) => tile.id));

/**
 * The tile rules, enforced here rather than in the form.
 *
 * The client disables a fourth tile and only offers catalog tiles, but that is
 * a convenience for the person typing. Once the security rules deny direct
 * writes, this is the only thing that decides what a reading may contain.
 */
export function validateTiles(tiles: string[], isFreebie: boolean): void {
  const unknown = tiles.filter((tile) => !TILE_IDS.has(tile));
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Unknown tile: ${unknown.join(', ')}.`,
    );
  }

  if (new Set(tiles).size !== tiles.length) {
    throw new HttpsError(
      'invalid-argument',
      'A reading cannot use the same tile twice.',
    );
  }

  if (!isFreebie && tiles.length > MAX_TILES_PER_BOOK) {
    throw new HttpsError(
      'invalid-argument',
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
