import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateTagCounts, harmonicSum } from './statistics.js';
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

  await t.test('calculateTagCounts', async (t) => {
    await t.test('should return an empty map for no books', () => {
      const inputs: ScoringInput[] = [];
      const tagCounts = calculateTagCounts(inputs);
      assert.equal(tagCounts.size, 0);
    });

    await t.test('should correctly count tags from a list of books', () => {
      const inputs: ScoringInput[] = [
        { tags: ['t01', 't02'], isFreebie: false },
        { tags: ['t01', 't03'], isFreebie: false },
        { tags: ['t04'], isFreebie: false },
        { tags: ['t01'], isFreebie: false },
      ];
      const tagCounts = calculateTagCounts(inputs);
      assert.equal(tagCounts.get('t01'), 3);
      assert.equal(tagCounts.get('t02'), 1);
      assert.equal(tagCounts.get('t03'), 1);
      assert.equal(tagCounts.get('t04'), 1);
      assert.equal(tagCounts.size, 4);
    });
  });
});
