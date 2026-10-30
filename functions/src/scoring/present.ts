import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import type { Reading } from '../readings/postgresStore.js';

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

export function toScoreDTO(breakdown: ScoreBreakdown): ScoreDTO {
  return {
    score: breakdown.score,
    varietyPoints: breakdown.varietyPoints,
    volumePoints: breakdown.volumePoints,
    tileCounts: Object.fromEntries(breakdown.tileCounts),
    totalBooks: breakdown.totalBooks,
  };
}

/** Scoring reads tag ids as opaque strings, under the field name it declares. */
export function toScoringInputs(readings: Reading[]): ScoringInput[] {
  return readings.map((reading) => ({
    tiles: reading.tagIds,
    isFreebie: reading.isFreebie,
  }));
}
