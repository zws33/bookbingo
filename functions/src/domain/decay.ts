import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import type { ScoringEngine } from './engine.js';
import { calculateTagCounts } from './statistics.js';

/**
 * `y_min = 0` would make every repeat worth exactly nothing rather than less,
 * which is I2 gone; `y_max = 1` makes a repeat worth a full new tag.
 */
export function requireParamsInBounds(yMin: number, yMax: number): void {
  if (!(yMin > 0 && yMin <= yMax && yMax < 1)) {
    throw new DomainError(
      'corrupt',
      `Scoring parameters out of bounds: need 0 < y_min <= y_max < 1, got y_min=${yMin}, y_max=${yMax}.`,
    );
  }
}

const yMin = 0.2;
const yMax = 0.5;

requireParamsInBounds(yMin, yMax);

/**
 * The coverage-modulated decay algorithm:
 *
 *     S = k + Σᵢ Σ_{j=2}^{cᵢ} ρ(j)    ρ(j) = 1/j^p    p = log₂(1/y)
 *     y = y_min + (y_max − y_min)·(k−1)/(N−1)
 *
 * Coverage sets the slope of the decay and never scales the total, which is
 * what keeps covering a new tag worth at least a full point whatever the
 * distribution. `p` is therefore computed once from `k` and held constant
 * across the sum.
 */
export function coverageDecay(tagsCount: number): ScoringEngine {
  /**
   * ρ(2). The ramp divides by `N − 1` so that `y_min` and `y_max` are reached
   * exactly, which leaves `N = 1` with no range to ramp over.
   */
  function coverageRamp(k: number): number {
    if (tagsCount <= 1) {
      return yMin;
    }
    const progress = (k - 1) / (tagsCount - 1);
    return yMin + (yMax - yMin) * progress;
  }

  return (inputs: ScoringInput[]): ScoreBreakdown => {
    const tagCounts = calculateTagCounts(inputs);
    const varietyPoints = tagCounts.size;

    if (varietyPoints === 0) {
      return {
        score: 0,
        varietyPoints: 0,
        volumePoints: 0,
        tagCounts,
        totalBooks: inputs.length,
      };
    }

    const p = Math.log2(1 / coverageRamp(varietyPoints));

    let volumePoints = 0;
    for (const count of tagCounts.values()) {
      for (let j = 2; j <= count; j++) {
        volumePoints += 1 / j ** p;
      }
    }

    return {
      score: varietyPoints + volumePoints,
      varietyPoints,
      volumePoints,
      tagCounts,
      totalBooks: inputs.length,
    };
  };
}
