import type { UserBook } from '@bookbingo/lib-types';

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
export function calculateTileCounts(userBooks: UserBook[]): Map<string, number> {
  const tileCounts = new Map<string, number>();
  for (const book of userBooks) {
    for (const tileId of book.tiles) {
      tileCounts.set(tileId, (tileCounts.get(tileId) || 0) + 1);
    }
  }
  return tileCounts;
}
