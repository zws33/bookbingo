import type { ScoreBreakdown, ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import type { ScoringEngine } from './engine.js';
import { calculateTagCounts } from './statistics.js';

/**
 * `y_min = 0` would make every repeat worth exactly nothing rather than less,
 * which is I2 gone; `y_max = 1` makes a repeat worth a full new tag. At
 * `shift = 0` the denominator is zero at the first repeat; `shift >= 1` is a
 * preference, not an invariant.
 */
export function requireParamsInBounds(
  yMin: number,
  yMax: number,
  shift: number,
): void {
  if (!(yMin > 0 && yMin <= yMax && yMax < 1)) {
    throw new DomainError(
      'corrupt',
      `Scoring parameters out of bounds: need 0 < y_min <= y_max < 1, got y_min=${yMin}, y_max=${yMax}.`,
    );
  }
  if (!(shift > 0)) {
    throw new DomainError(
      'corrupt',
      `Scoring parameters out of bounds: need shift > 0, got shift=${shift}.`,
    );
  }
}

const yMin = 0.45;
const yMax = 0.75;
const shift = 2;

requireParamsInBounds(yMin, yMax, shift);

/**
 * The shifted-harmonic algorithm:
 *
 *     S = k + Σᵢ Σ_{j=2}^{cᵢ} ρ(j)    ρ(j) = y·a/(j − 2 + a)
 *     y = y_min + (y_max − y_min)·(k−1)/(N−1)
 *
 * `a` in the numerator is the scale forced by ρ(2) = y, so the first repeat is
 * worth `y` whatever the shift. The 1/j tail holds a tile's volume to
 * logarithmic growth, which is what removes the ceiling `coverage-decay` has:
 * there, deriving the exponent from `y` caps `y_max` at 0.5.
 */
export function shiftedHarmonic(tagsCount: number): ScoringEngine {
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

    const scale = coverageRamp(varietyPoints, tagsCount) * shift;

    let volumePoints = 0;
    for (const count of tagCounts.values()) {
      for (let j = 2; j <= count; j++) {
        volumePoints += scale / (j - 2 + shift);
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

/**
 * ρ(2). The ramp divides by `N − 1` so that `y_min` and `y_max` are reached
 * exactly, which leaves `N = 1` with no range to ramp over.
 */
function coverageRamp(k: number, tagsCount: number): number {
  if (tagsCount <= 1) {
    return yMin;
  }
  const progress = (k - 1) / (tagsCount - 1);
  return yMin + (yMax - yMin) * progress;
}
