/**
 * Calculates the mean (average) of a list of numbers.
 * @param {number[]} values - An array of numbers.
 * @returns {number} The mean of the numbers.
 */
export function calculateMean(values) {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/**
 * Calculates the standard deviation of a list of numbers.
 * @param {number[]} values - An array of numbers.
 * @returns {number} The standard deviation.
 */
export function calculateStdDev(values) {
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
 * @param {number[]} values - An array of numbers.
 * @returns {number} The coefficient of variation.
 */
export function calculateCV(values) {
  const mean = calculateMean(values);
  if (mean === 0) {
    return 0;
  }
  const stdDev = calculateStdDev(values);
  return stdDev / mean;
}

/**
 * Counts the number of books assigned to each tile.
 * @param {import('../data/index.js').UserBook[]} userBooks - A list of user's books.
 * @returns {Map<string, number>} A map where keys are tile IDs and values are counts.
 */
export function calculateTileCounts(userBooks) {
  const tileCounts = new Map();
  for (const book of userBooks) {
    for (const tileId of book.tiles) {
      tileCounts.set(tileId, (tileCounts.get(tileId) || 0) + 1);
    }
  }
  return tileCounts;
}

