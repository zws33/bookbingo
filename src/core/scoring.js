import { calculateCV, calculateTileCounts } from './statistics.js';

/**
 * Calculates the base points from the tile counts.
 * BasePoints = Σ (1 + log2(booksInTile)) for each tile with books.
 * @param {Map<string, number>} tileCounts - A map of tile IDs to book counts.
 * @returns {number} The total base points.
 */
export function calculateBasePoints(tileCounts) {
  let basePoints = 0;
  for (const count of tileCounts.values()) {
    if (count > 0) {
      basePoints += 1 + Math.log2(count);
    }
  }
  return basePoints;
}

/**
 * Calculates the balance multiplier from the tile counts.
 * BalanceMultiplier = 1 / (1 + CV²), where CV is the coefficient of variation.
 * @param {Map<string, number>} tileCounts - A map of tile IDs to book counts.
 * @returns {number} The balance multiplier.
 */
export function calculateBalanceMultiplier(tileCounts) {
  const counts = Array.from(tileCounts.values());
  const cv = calculateCV(counts);
  return 1 / (1 + cv ** 2);
}

/**
 * Calculates the final score for a user.
 * @param {import('../data/index.js').UserBook[]} userBooks - A list of the user's books.
 * @returns {number} The final calculated score.
 */
export function calculateScore(userBooks) {
  if (!userBooks || userBooks.length === 0) {
    return 0;
  }
  const tileCounts = calculateTileCounts(userBooks);
  const basePoints = calculateBasePoints(tileCounts);
  const balanceMultiplier = calculateBalanceMultiplier(tileCounts);
  return basePoints * balanceMultiplier;
}

/**
 * Provides a detailed breakdown of the score calculation.
 * @param {import('../data/index.js').UserBook[]} userBooks - A list of the user's books.
 * @returns {{
 *   score: number;
 *   basePoints: number;
 *   balanceMultiplier: number;
 *   tileCounts: Map<string, number>;
 *   totalBooks: number;
 * }}
 */
export function getScoreBreakdown(userBooks) {
  const totalBooks = userBooks.length;
  if (totalBooks === 0) {
    return {
      score: 0,
      basePoints: 0,
      balanceMultiplier: 1,
      tileCounts: new Map(),
      totalBooks: 0,
    };
  }

  const tileCounts = calculateTileCounts(userBooks);
  const basePoints = calculateBasePoints(tileCounts);
  const balanceMultiplier = calculateBalanceMultiplier(tileCounts);
  const score = basePoints * balanceMultiplier;

  return {
    score,
    basePoints,
    balanceMultiplier,
    tileCounts,
    totalBooks,
  };
}

