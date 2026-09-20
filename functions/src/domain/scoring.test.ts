import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  calculateVarietyPoints,
  calculateVolumePoints,
  calculateBalanceFactor,
  calculateScore,
  getScoreBreakdown,
} from './scoring.js';
import { harmonicSum } from './statistics.js';
import type { ScoringInput } from '@bookbingo/lib-types';

function makeBook(tiles: string[]): ScoringInput {
  return {
    tiles,
    isFreebie: false,
  };
}

/**
 * Builds books whose tile distribution matches `spec`, given as
 * `[tilesAtThisCount, booksPerTile]` pairs, packed 3 tiles per book.
 * e.g. `[[5, 2], [20, 1]]` → 5 tiles holding 2 books each, 20 holding 1.
 */
function booksWithDistribution(spec: [number, number][]): ScoringInput[] {
  const slots: string[] = [];
  let tileNo = 0;
  for (const [tileCount, booksPerTile] of spec) {
    for (let i = 0; i < tileCount; i++) {
      const tileId = `x${tileNo++}`;
      for (let b = 0; b < booksPerTile; b++) {
        slots.push(tileId);
      }
    }
  }
  const books: ScoringInput[] = [];
  for (let i = 0; i < slots.length; i += 3) {
    books.push(makeBook(slots.slice(i, i + 3)));
  }
  return books;
}

test('Scoring', async (t) => {
  await t.test('calculateVarietyPoints', async (t) => {
    await t.test('should count unique tiles', () => {
      const tileCounts = new Map([
        ['a', 3],
        ['b', 1],
        ['c', 2],
      ]);
      assert.equal(calculateVarietyPoints(tileCounts), 3);
    });

    await t.test('should return 0 for empty map', () => {
      assert.equal(calculateVarietyPoints(new Map()), 0);
    });
  });

  await t.test('calculateVolumePoints', async (t) => {
    await t.test('should return 0 when all tiles have exactly 1 book', () => {
      const tileCounts = new Map([
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ]);
      assert.equal(calculateVolumePoints(tileCounts), 0);
    });

    await t.test('should return H(n)-1 for a single tile with n books', () => {
      const tileCounts = new Map([['a', 5]]);
      const expected = harmonicSum(5) - 1;
      assert.ok(Math.abs(calculateVolumePoints(tileCounts) - expected) < 1e-10);
    });

    await t.test('should sum across multiple tiles', () => {
      const tileCounts = new Map([
        ['a', 3],
        ['b', 2],
      ]);
      const expected = harmonicSum(3) - 1 + (harmonicSum(2) - 1);
      assert.ok(Math.abs(calculateVolumePoints(tileCounts) - expected) < 1e-10);
    });
  });

  await t.test('calculateBalanceFactor', async (t) => {
    await t.test('should return 1.0 for perfectly balanced tiles', () => {
      const tileCounts = new Map([
        ['a', 2],
        ['b', 2],
        ['c', 2],
      ]);
      assert.equal(calculateBalanceFactor(tileCounts), 1);
    });

    await t.test('should return 1.0 for a single tile', () => {
      const tileCounts = new Map([['a', 5]]);
      assert.equal(calculateBalanceFactor(tileCounts), 1);
    });

    await t.test('should return less than 1 for unbalanced tiles', () => {
      const tileCounts = new Map([
        ['a', 10],
        ['b', 1],
      ]);
      const factor = calculateBalanceFactor(tileCounts);
      assert.ok(factor > 0 && factor < 1);
    });
  });

  await t.test('calculateScore', async (t) => {
    await t.test('should return 0 for empty input', () => {
      assert.equal(calculateScore([]), 0);
    });

    await t.test('should return 1 for a single book in one tile', () => {
      assert.equal(calculateScore([makeBook(['a'])]), 1);
    });

    await t.test('tiles a,b,c + b,c,d example', () => {
      const books = [makeBook(['a', 'b', 'c']), makeBook(['b', 'c', 'd'])];
      // Tile counts: a=1, b=2, c=2, d=1 → 4 unique tiles
      // Variety: 4
      // Volume: (H(2)-1) + (H(2)-1) = 0.5 + 0.5 = 1.0
      // Balance factor: CV of [1,2,2,1] = stdDev/mean = 0.5/1.5 = 0.333...
      //   → 1/(1+0.333²) = 1/1.111 = 0.9
      // Score = 4 + 1.0 * 0.9 = 4.9
      const score = calculateScore(books);
      assert.ok(Math.abs(score - 4.9) < 0.1);
    });

    await t.test('balanced reader should score higher than unbalanced', () => {
      // Balanced: 10 books, 1 per tile across 10 tiles
      const balanced = Array.from({ length: 10 }, (_, i) =>
        makeBook([`t${i}`]),
      );
      // Unbalanced: 10 books, all in 2 tiles
      const unbalanced = Array.from({ length: 10 }, (_, i) =>
        makeBook([i < 5 ? 'a' : 'b']),
      );
      assert.ok(calculateScore(balanced) > calculateScore(unbalanced));
    });

    await t.test('harmonic strategy should not apply balance penalty', () => {
      const books = [
        ...Array.from({ length: 5 }, () => makeBook(['a'])),
        makeBook(['b']),
      ];
      const balancedScore = calculateScore(books, 'balanced-harmonic');
      const harmonicScore = calculateScore(books, 'harmonic');
      // Harmonic should be >= balanced-harmonic (no penalty)
      assert.ok(harmonicScore >= balancedScore);
    });

    await t.test(
      'harmonic and balanced-harmonic should be equal when balanced',
      () => {
        const books = [makeBook(['a']), makeBook(['b']), makeBook(['c'])];
        const balancedScore = calculateScore(books, 'balanced-harmonic');
        const harmonicScore = calculateScore(books, 'harmonic');
        // All tiles have count 1, so no volume points. Scores should be equal.
        assert.equal(balancedScore, harmonicScore);
      },
    );
  });

  // Four reader profiles that together demonstrate what the scoring system rewards.
  // Ported from the prose worked examples in the retired docs/SCORING_PLAN.md, whose
  // hand-computed balance factors were all wrong — its own "key takeaway" cited
  // figures that contradicted the claim they were offered as evidence for.
  await t.test('worked scenarios', async (t) => {
    const balanced10 = booksWithDistribution([
      [5, 2],
      [20, 1],
    ]);
    const unbalanced10 = booksWithDistribution([
      [3, 5],
      [3, 3],
      [6, 1],
    ]);
    const stacker30 = booksWithDistribution([
      [5, 12],
      [10, 3],
    ]);
    const balanced30 = booksWithDistribution([
      [30, 2],
      [10, 3],
    ]);

    await t.test('A — balanced reader, 10 books across 25 tiles', () => {
      const b = getScoreBreakdown(balanced10);
      assert.equal(b.totalBooks, 10);
      assert.equal(b.varietyPoints, 25);
      assert.ok(Math.abs(b.volumePoints - 2.5) < 1e-10);
      assert.ok(Math.abs(b.balanceFactor - 0.9) < 1e-4);
      assert.ok(Math.abs(b.score - 27.25) < 1e-4);
    });

    await t.test('B — unbalanced reader, 10 books across 12 tiles', () => {
      const b = getScoreBreakdown(unbalanced10);
      assert.equal(b.totalBooks, 10);
      assert.equal(b.varietyPoints, 12);
      assert.ok(Math.abs(b.balanceFactor - 0.6944) < 1e-4);
      assert.ok(Math.abs(b.score - 16.4097) < 1e-4);
    });

    await t.test('C — volume stacker, 30 books across 15 tiles', () => {
      const b = getScoreBreakdown(stacker30);
      assert.equal(b.totalBooks, 30);
      assert.equal(b.varietyPoints, 15);
      assert.ok(Math.abs(b.balanceFactor - 0.6667) < 1e-4);
      assert.ok(Math.abs(b.score - 27.5663) < 1e-4);
    });

    await t.test('D — balanced reader, 30 books across 40 tiles', () => {
      const b = getScoreBreakdown(balanced30);
      assert.equal(b.totalBooks, 30);
      assert.equal(b.varietyPoints, 40);
      assert.ok(Math.abs(b.balanceFactor - 0.9643) < 1e-4);
      assert.ok(Math.abs(b.score - 62.5) < 1e-4);
    });

    // The properties above exist to protect these three relationships. They are the
    // actual design claims; the magnitudes are just how they happen to come out today.
    await t.test(
      'tripling volume by stacking barely beats reading broadly',
      () => {
        // 30 concentrated books edge out 10 well-spread ones — but only just, which is
        // the intended shape of the incentive.
        const stacker = calculateScore(stacker30);
        const balanced = calculateScore(balanced10);
        assert.ok(stacker > balanced);
        assert.ok(stacker - balanced < 1);
      },
    );

    await t.test(
      'spreading the same 30 books more than doubles the score',
      () => {
        assert.ok(calculateScore(balanced30) > 2 * calculateScore(stacker30));
      },
    );

    await t.test('the balance penalty is what separates C from D', () => {
      // Under 'harmonic' the balance factor is fixed at 1.0, so concentration costs
      // nothing and the stacker closes most of the gap.
      const spread = calculateScore(balanced30, 'harmonic');
      const stacked = calculateScore(stacker30, 'harmonic');
      assert.ok(
        spread - stacked <
          calculateScore(balanced30) - calculateScore(stacker30),
      );
    });
  });

  await t.test('getScoreBreakdown', async (t) => {
    await t.test('should return zeroed breakdown for empty input', () => {
      const b = getScoreBreakdown([]);
      assert.equal(b.score, 0);
      assert.equal(b.varietyPoints, 0);
      assert.equal(b.volumePoints, 0);
      assert.equal(b.balanceFactor, 1);
      assert.equal(b.totalBooks, 0);
      assert.equal(b.tileCounts.size, 0);
    });

    await t.test('should be consistent with calculateScore', () => {
      const books = [makeBook(['a', 'b']), makeBook(['b', 'c'])];
      const score = calculateScore(books);
      const breakdown = getScoreBreakdown(books);
      assert.equal(breakdown.score, score);
    });

    await t.test(
      'should be consistent with calculateScore for harmonic',
      () => {
        const books = [makeBook(['a', 'b']), makeBook(['b', 'c'])];
        const score = calculateScore(books, 'harmonic');
        const breakdown = getScoreBreakdown(books, 'harmonic');
        assert.equal(breakdown.score, score);
        assert.equal(breakdown.balanceFactor, 1);
      },
    );

    await t.test('should report correct tile counts', () => {
      const books = [makeBook(['a', 'b', 'c']), makeBook(['b', 'c', 'd'])];
      const b = getScoreBreakdown(books);
      assert.equal(b.tileCounts.get('a'), 1);
      assert.equal(b.tileCounts.get('b'), 2);
      assert.equal(b.tileCounts.get('c'), 2);
      assert.equal(b.tileCounts.get('d'), 1);
      assert.equal(b.totalBooks, 2);
      assert.equal(b.varietyPoints, 4);
    });
  });
});
