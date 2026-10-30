import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import type { ScoringEngine, ScoringParams } from './scoringEngines.js';
import { calculateTileCounts } from './statistics.js';

/**
 * `y_min = 0` would make every repeat worth exactly nothing rather than less,
 * which is I2 gone; `y_max = 1` makes a repeat worth a full new tag.
 */
function requireKnobsInBounds(yMin: number, yMax: number): void {
  if (!(yMin > 0 && yMin <= yMax && yMax < 1)) {
    throw new DomainError(
      'corrupt',
      `Scoring knobs out of bounds: need 0 < y_min <= y_max < 1, got y_min=${yMin}, y_max=${yMax}.`,
    );
  }
}

/**
 * The coverage-modulated decay model (docs/scoring-model.md):
 *
 *     S = k + Σᵢ Σ_{j=2}^{cᵢ} ρ(j)    ρ(j) = 1/j^p    p = log₂(1/y)
 *     y = y_min + (y_max − y_min)·(k−1)/(N−1)
 *
 * Coverage sets the slope of the decay and never scales the total, which is
 * what keeps covering a new tag worth at least a full point whatever the
 * distribution. `p` is therefore computed once from `k` and held constant
 * across the sum.
 */
export function coverageDecay({
  yMin,
  yMax,
  vocabularySize,
}: ScoringParams): ScoringEngine {
  requireKnobsInBounds(yMin, yMax);

  /**
   * ρ(2). The ramp divides by `N − 1` so that `y_min` and `y_max` are reached
   * exactly, which leaves `N = 1` with no range to ramp over.
   */
  function firstRepeatValue(k: number): number {
    if (vocabularySize <= 1) {
      return yMin;
    }
    return yMin + (yMax - yMin) * ((k - 1) / (vocabularySize - 1));
  }

  return (inputs: ScoringInput[]): ScoreBreakdown => {
    const tileCounts = calculateTileCounts(inputs);
    const varietyPoints = tileCounts.size;

    if (varietyPoints === 0) {
      return {
        score: 0,
        varietyPoints: 0,
        volumePoints: 0,
        tileCounts,
        totalBooks: inputs.length,
      };
    }

    const p = Math.log2(1 / firstRepeatValue(varietyPoints));

    let volumePoints = 0;
    for (const count of tileCounts.values()) {
      for (let j = 2; j <= count; j++) {
        volumePoints += 1 / j ** p;
      }
    }

    return {
      score: varietyPoints + volumePoints,
      varietyPoints,
      volumePoints,
      tileCounts,
      totalBooks: inputs.length,
    };
  };
}
