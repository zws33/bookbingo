import type { ScoringInput } from '@bookbingo/lib-types';

/**
 * Calculates the mean (average) of a list of numbers.
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/**
 * Calculates the standard deviation of a list of numbers.
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = calculateMean(values);
  const squaredDifferences = values.map((value) => (value - mean) ** 2);
  const variance = calculateMean(squaredDifferences);
  return Math.sqrt(variance);
}

/**
 * Calculates the coefficient of variation (CV).
 */
export function calculateCV(values: number[]): number {
  const mean = calculateMean(values);
  if (mean === 0) {
    return 0;
  }
  const stdDev = calculateStdDev(values);
  return stdDev / mean;
}

/**
 * Counts the number of books assigned to each tile.
 */
export function calculateTileCounts(
  inputs: ScoringInput[],
): Map<string, number> {
  const tileCounts = new Map<string, number>();
  for (const input of inputs) {
    for (const tileId of input.tiles) {
      tileCounts.set(tileId, (tileCounts.get(tileId) || 0) + 1);
    }
  }
  return tileCounts;
}

/**
 * Calculates the harmonic sum H(n) = 1 + 1/2 + 1/3 + ... + 1/n.
 */
export function harmonicSum(n: number): number {
  if (n <= 0) {
    return 0;
  }
  let sum = 0;
  for (let k = 1; k <= n; k++) {
    sum += 1 / k;
  }
  return sum;
}
