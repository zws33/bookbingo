import type {
  ScoringInput,
  ScoreBreakdown,
  ScoringStrategy,
} from '@bookbingo/lib-types';
import { calculateCV, calculateTileCounts, harmonicSum } from './statistics.js';

const DEFAULT_STRATEGY: ScoringStrategy = 'balanced-harmonic';

/**
 * Counts the number of unique tiles that have at least one book.
 */
export function calculateVarietyPoints(
  tileCounts: Map<string, number>,
): number {
  let count = 0;
  for (const n of tileCounts.values()) {
    if (n > 0) {
      count++;
    }
  }
  return count;
}

/**
 * Calculates the diminishing-return points from repeat books.
 * For each tile, contributes H(count) - 1 (the first book is counted in variety points).
 *
 * Harmonic rather than logarithmic decay: with log₂ the 2nd book in a tile scores a
 * full 1.0 — identical to covering a brand-new tile — which erases the variety signal
 * at exactly the margin where it should bite hardest. Harmonic gives it 0.5.
 */
export function calculateVolumePoints(tileCounts: Map<string, number>): number {
  let volume = 0;
  for (const count of tileCounts.values()) {
    if (count > 1) {
      volume += harmonicSum(count) - 1;
    }
  }
  return volume;
}

/**
 * Calculates the balance factor from the tile counts.
 * Returns 1 / (1 + CV²), where CV is the coefficient of variation.
 * Returns 1.0 when there are fewer than 2 tiles (balance is not meaningful).
 *
 * Squaring CV keeps the penalty near-flat for mild unevenness and steep for real
 * concentration; 1/(1+CV) would tax an already-balanced reader for ordinary noise.
 *
 * Callers apply this to volume points only, never to variety points — covering a new
 * tile must stay unconditionally the best move available, whatever the distribution.
 */
export function calculateBalanceFactor(
  tileCounts: Map<string, number>,
): number {
  const counts = Array.from(tileCounts.values());
  if (counts.length < 2) {
    return 1;
  }
  const cv = calculateCV(counts);
  return 1 / (1 + cv ** 2);
}

/**
 * Calculates the final score for a user.
 *
 * Score = varietyPoints + volumePoints × balanceFactor
 *
 * With 'harmonic' strategy, balanceFactor is always 1.0.
 * With 'balanced-harmonic' strategy, balanceFactor = 1/(1+CV²).
 */
export function calculateScore(
  inputs: ScoringInput[],
  strategy: ScoringStrategy = DEFAULT_STRATEGY,
): number {
  if (!inputs || inputs.length === 0) {
    return 0;
  }
  const tileCounts = calculateTileCounts(inputs);
  const varietyPoints = calculateVarietyPoints(tileCounts);
  const volumePoints = calculateVolumePoints(tileCounts);
  const balanceFactor =
    strategy === 'balanced-harmonic' ? calculateBalanceFactor(tileCounts) : 1;
  return varietyPoints + volumePoints * balanceFactor;
}

/**
 * Provides a detailed breakdown of the score calculation.
 */
export function getScoreBreakdown(
  inputs: ScoringInput[],
  strategy: ScoringStrategy = DEFAULT_STRATEGY,
): ScoreBreakdown {
  const totalBooks = inputs.length;
  if (totalBooks === 0) {
    return {
      score: 0,
      varietyPoints: 0,
      volumePoints: 0,
      balanceFactor: 1,
      tileCounts: new Map(),
      totalBooks: 0,
    };
  }

  const tileCounts = calculateTileCounts(inputs);
  const varietyPoints = calculateVarietyPoints(tileCounts);
  const volumePoints = calculateVolumePoints(tileCounts);
  const balanceFactor =
    strategy === 'balanced-harmonic' ? calculateBalanceFactor(tileCounts) : 1;
  const score = varietyPoints + volumePoints * balanceFactor;

  return {
    score,
    varietyPoints,
    volumePoints,
    balanceFactor,
    tileCounts,
    totalBooks,
  };
}
