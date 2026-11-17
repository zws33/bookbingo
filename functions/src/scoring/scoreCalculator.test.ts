import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Engines } from '../domain/scoringEngines.js';
import { scoreCalculator } from './scoreCalculator.js';

const readings = (counts: number[]) =>
  counts.flatMap((count, tile) =>
    Array.from({ length: count }, () => ({
      tags: [`t${tile}`],
      isFreebie: false,
    })),
  );

test('scoreCalculator', async (t) => {
  await t.test('takes N from the challenge, not from the catalog', () => {
    const same = readings([4, 1, 1]);
    const narrow = scoreCalculator('COVERAGE_DECAY', 3);
    const wide = scoreCalculator('COVERAGE_DECAY', 40);

    // Coverage of 3 is full in a 3-tag vocabulary and barely any of a 40-tag
    // one, so the same readings decay differently.
    assert.ok(narrow(same).score > wide(same).score);
  });

  await t.test('scores every input list independently', () => {
    const first = readings([1, 1]);
    const second = readings([3]);
    const firstFromFreshEngine = scoreCalculator('COVERAGE_DECAY', 25)(first);

    const scoreOf = scoreCalculator('COVERAGE_DECAY', 25);
    scoreOf(second);

    // A reused calculator must not carry the previous list's tile counts.
    assert.deepEqual(scoreOf(first), firstFromFreshEngine);
  });

  await t.test('encodes tile counts as a plain object', () => {
    const dto = scoreCalculator('COVERAGE_DECAY', 25)(readings([2, 1]));

    assert.deepEqual(dto.tileCounts, { t0: 2, t1: 1 });
    assert.equal(dto.varietyPoints, 2);
    assert.equal(dto.totalBooks, 3);
  });

  await t.test('scores an empty reading list as zero', () => {
    assert.deepEqual(scoreCalculator('COVERAGE_DECAY', 25)([]), {
      score: 0,
      varietyPoints: 0,
      volumePoints: 0,
      tileCounts: {},
      totalBooks: 0,
    });
  });

  await t.test('scores a challenge with no tags at all', () => {
    // A draft challenge before its vocabulary exists: N = 0, and no reading can
    // reference a tag that is not there, so there is nothing to score.
    assert.equal(scoreCalculator('COVERAGE_DECAY', 0)([]).score, 0);
  });

  await t.test('every engine scores an empty list as zero', () => {
    for (const engine of Engines) {
      assert.deepEqual(scoreCalculator(engine, 25)([]), {
        score: 0,
        varietyPoints: 0,
        volumePoints: 0,
        tileCounts: {},
        totalBooks: 0,
      });
    }
  });

  await t.test('every engine counts books and tags the same way', () => {
    for (const engine of Engines) {
      const dto = scoreCalculator(engine, 25)(readings([2, 1]));
      assert.deepEqual(dto.tileCounts, { t0: 2, t1: 1 });
      assert.equal(dto.varietyPoints, 2);
      assert.equal(dto.totalBooks, 3);
    }
  });
});
