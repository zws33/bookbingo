import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import type { Reading } from '../readings/store.js';

/**
 * The score breakdown as the API returns it.
 *
 * `tileCounts` is a Record, not the domain's Map: JSON has no Map, and an
 * encoded one arrives as `{}`. It is also where the domain's `tagCounts`
 * becomes the wire's `tile` (challenge-model rule 13).
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
    tileCounts: Object.fromEntries(breakdown.tagCounts),
    totalBooks: breakdown.totalBooks,
  };
}

export function toScoringInputs(readings: Reading[]): ScoringInput[] {
  return readings.map((reading) => ({
    tags: reading.tagIds,
    isFreebie: reading.isFreebie,
  }));
}
