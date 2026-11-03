import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateTileCounts, harmonicSum } from './statistics.js';
import type { ScoringInput } from '@bookbingo/lib-types';

test('Statistics Core', async (t) => {
  await t.test('harmonicSum', async (t) => {
    await t.test('should return 0 for n <= 0', () => {
      assert.equal(harmonicSum(0), 0);
      assert.equal(harmonicSum(-1), 0);
    });

    await t.test('should return 1 for n = 1', () => {
      assert.equal(harmonicSum(1), 1);
    });

    await t.test('should return 1.5 for n = 2', () => {
      assert.equal(harmonicSum(2), 1.5);
    });

    await t.test('should return correct value for n = 5', () => {
      const expected = 1 + 1 / 2 + 1 / 3 + 1 / 4 + 1 / 5;
      assert.ok(Math.abs(harmonicSum(5) - expected) < 1e-10);
    });
  });

  await t.test('calculateTileCounts', async (t) => {
    await t.test('should return an empty map for no books', () => {
      const inputs: ScoringInput[] = [];
      const tileCounts = calculateTileCounts(inputs);
      assert.equal(tileCounts.size, 0);
    });

    await t.test('should correctly count tiles from a list of books', () => {
      const inputs: ScoringInput[] = [
        { tiles: ['t01', 't02'], isFreebie: false },
        { tiles: ['t01', 't03'], isFreebie: false },
        { tiles: ['t04'], isFreebie: false },
        { tiles: ['t01'], isFreebie: false },
      ];
      const tileCounts = calculateTileCounts(inputs);
      assert.equal(tileCounts.get('t01'), 3);
      assert.equal(tileCounts.get('t02'), 1);
      assert.equal(tileCounts.get('t03'), 1);
      assert.equal(tileCounts.get('t04'), 1);
      assert.equal(tileCounts.size, 4);
    });
  });
});
