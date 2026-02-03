import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateMean, calculateStdDev, calculateCV, calculateTileCounts } from './statistics.js';
import type { UserBook } from '../types/index.js';

test('Statistics Core', async (t) => {
  await t.test('calculateMean', async (t) => {
    await t.test('should return 0 for an empty array', () => {
      assert.equal(calculateMean([]), 0);
    });

    await t.test('should calculate the correct mean for an array of numbers', () => {
      assert.equal(calculateMean([1, 2, 3, 4, 5]), 3);
    });
  });

  await t.test('calculateStdDev', async (t) => {
    await t.test('should return 0 for an array with less than 2 elements', () => {
      assert.equal(calculateStdDev([]), 0);
      assert.equal(calculateStdDev([1]), 0);
    });

    await t.test('should calculate the correct standard deviation', () => {
      const values = [1, 2, 3, 4, 5];
      // Mean = 3
      // Deviations: -2, -1, 0, 1, 2
      // Squared deviations: 4, 1, 0, 1, 4
      // Sum of squared deviations = 10
      // Variance = 10 / 5 = 2
      // StdDev = sqrt(2) = 1.414...
      assert.ok(Math.abs(calculateStdDev(values) - Math.sqrt(2)) < 0.001);
    });
  });

  await t.test('calculateCV', async (t) => {
    await t.test('should return 0 if mean is 0', () => {
      assert.equal(calculateCV([0, 0, 0]), 0);
    });

    await t.test('should calculate the correct coefficient of variation', () => {
      const values = [1, 2, 3, 4, 5];
      const mean = 3;
      const stdDev = Math.sqrt(2);
      const expectedCV = stdDev / mean;
      assert.ok(Math.abs(calculateCV(values) - expectedCV) < 0.001);
    });
  });

  await t.test('calculateTileCounts', async (t) => {
    await t.test('should return an empty map for no books', () => {
      const userBooks: UserBook[] = [];
      const tileCounts = calculateTileCounts(userBooks);
      assert.equal(tileCounts.size, 0);
    });

    await t.test('should correctly count tiles from a list of books', () => {
      const userBooks = [
        { tiles: ['t01', 't02'] },
        { tiles: ['t01', 't03'] },
        { tiles: ['t04'] },
        { tiles: ['t01'] },
      ] as UserBook[];
      const tileCounts = calculateTileCounts(userBooks);
      assert.equal(tileCounts.get('t01'), 3);
      assert.equal(tileCounts.get('t02'), 1);
      assert.equal(tileCounts.get('t03'), 1);
      assert.equal(tileCounts.get('t04'), 1);
      assert.equal(tileCounts.size, 4);
    });
  });
});
