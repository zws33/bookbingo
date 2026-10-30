import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import { coverageDecay } from './decay.js';
import type { ScoringEngine } from './scoringEngines.js';
import { harmonicSum } from './statistics.js';

const KNOBS = { yMin: 0.2, yMax: 0.5 };

/** The bound-case parameters the model doc verifies I1 at, not the live ones. */
const BOUND_CASE = { yMin: 0.2, yMax: 0.9 };

/** `counts[i]` books under tile `i`, one tile per book. */
function state(counts: number[]): ScoringInput[] {
  const readings: ScoringInput[] = [];
  counts.forEach((count, tile) => {
    for (let n = 0; n < count; n++) {
      readings.push({ tiles: [`t${tile}`], isFreebie: false });
    }
  });
  return readings;
}

/** `k` tiles covered, one of them holding `depth` books. */
function atCoverage(k: number, depth: number): ScoringInput[] {
  return state([depth, ...Array(k - 1).fill(1)]);
}

/**
 * ρ(j) read through the public surface: the score a tile's j-th book adds with
 * coverage held at `k`, which is what the invariants are stated about.
 */
function repeatValue(engine: ScoringEngine, k: number, j: number): number {
  return engine(atCoverage(k, j)).score - engine(atCoverage(k, j - 1)).score;
}

const randomInt = (bound: number) => Math.floor(Math.random() * bound);

function pickDistinct(howMany: number, bound: number): Set<number> {
  const picked = new Set<number>();
  while (picked.size < howMany) picked.add(randomInt(bound));
  return picked;
}

function bump(counts: number[], tiles: number[]): number[] {
  const next = [...counts];
  for (const tile of tiles) next[tile] = next[tile]! + 1;
  return next;
}

test('coverageDecay', async (t) => {
  await t.test('scores an empty reading list as zero', () => {
    const b = coverageDecay({ ...KNOBS, vocabularySize: 25 })([]);
    assert.equal(b.score, 0);
    assert.equal(b.varietyPoints, 0);
    assert.equal(b.volumePoints, 0);
    assert.equal(b.totalBooks, 0);
    assert.equal(b.tileCounts.size, 0);
  });

  await t.test('counts a book that claims no tile, and scores it zero', () => {
    const b = coverageDecay({ ...KNOBS, vocabularySize: 25 })([
      { tiles: [], isFreebie: false },
    ]);
    assert.equal(b.totalBooks, 1);
    assert.equal(b.score, 0);
  });

  await t.test('a freebie scores as the single-tile books it claims', () => {
    const engine = coverageDecay({ ...KNOBS, vocabularySize: 25 });
    const freebie = engine([{ tiles: ['t0', 't1', 't2'], isFreebie: true }]);
    assert.equal(freebie.score, engine(state([1, 1, 1])).score);
  });

  await t.test('counts every tile a book claims', () => {
    const b = coverageDecay({ ...KNOBS, vocabularySize: 25 })([
      { tiles: ['a', 'b'], isFreebie: false },
      { tiles: ['b', 'c'], isFreebie: false },
    ]);
    assert.equal(b.tileCounts.get('a'), 1);
    assert.equal(b.tileCounts.get('b'), 2);
    assert.equal(b.tileCounts.get('c'), 1);
    assert.equal(b.varietyPoints, 3);
    assert.equal(b.totalBooks, 2);
  });

  await t.test('calibration', async (t) => {
    await t.test('y_max = 0.50 puts p at exactly 1 when k = N', () => {
      // At p = 1 the repeat sum is the harmonic series, so the whole curve is
      // pinned to a closed form rather than to a recorded number.
      const b = coverageDecay({ ...KNOBS, vocabularySize: 25 })(
        atCoverage(25, 31),
      );
      assert.equal(b.varietyPoints, 25);
      assert.ok(Math.abs(b.volumePoints - (harmonicSum(31) - 1)) < 1e-12);
    });

    await t.test('y_min = 0.20 caps one tile at k = 1 near 0.42', () => {
      // p > 1 there, so the repeat series converges however deep the tile goes.
      const engine = coverageDecay({ ...KNOBS, vocabularySize: 25 });
      const deep = engine(atCoverage(1, 5000)).volumePoints;
      assert.ok(deep > 0.4 && deep < 0.43, `got ${deep}`);
      assert.ok(engine(atCoverage(1, 100000)).volumePoints < 0.43);
    });
  });

  await t.test('I1 — every book strictly increases the score', () => {
    // Random states crossed with the three move types, at the bound-case knobs
    // rather than the live ones: a wider ramp is where I1 is tightest.
    const engine = coverageDecay({ ...BOUND_CASE, vocabularySize: 25 });
    let smallest = Infinity;

    for (let trial = 0; trial < 5000; trial++) {
      // The first tile is seeded covered, so every move type has a tile to act on.
      const counts = [
        1 + randomInt(12),
        ...Array.from({ length: 24 }, () => randomInt(13)),
      ];
      const before = engine(state(counts)).score;

      const covered = counts.flatMap((count, i) => (count > 0 ? [i] : []));
      const uncovered = counts.flatMap((count, i) => (count === 0 ? [i] : []));

      const moves: number[][] = [
        bump(counts, [covered[randomInt(covered.length)]!]),
        // A book at tag_cap: three distinct tiles at once.
        bump(counts, [...pickDistinct(3, 25)]),
      ];

      if (uncovered.length > 0) {
        const fresh = [...counts];
        fresh[uncovered[randomInt(uncovered.length)]!] = 1;
        moves.push(fresh);
      }

      for (const move of moves) {
        smallest = Math.min(smallest, engine(state(move)).score - before);
      }
    }

    assert.ok(smallest > 0, `smallest score change was ${smallest}`);
  });

  await t.test('I2 — repeats pay less each time, and never zero', () => {
    for (const k of [1, 2, 5, 25]) {
      const engine = coverageDecay({ ...KNOBS, vocabularySize: 25 });
      let previous = Infinity;
      for (let j = 2; j <= 10; j++) {
        const value = repeatValue(engine, k, j);
        assert.ok(value > 0, `rho(${j}) at k=${k} was ${value}`);
        assert.ok(value < previous, `rho(${j}) at k=${k} did not decrease`);
        previous = value;
      }
    }
  });

  await t.test('I3 — broader coverage decays slower', () => {
    const engine = coverageDecay({ ...KNOBS, vocabularySize: 25 });
    for (let j = 2; j <= 6; j++) {
      for (let k = 2; k <= 25; k++) {
        assert.ok(
          repeatValue(engine, k, j) > repeatValue(engine, k - 1, j),
          `rho(${j}) did not rise from k=${k - 1} to k=${k}`,
        );
      }
    }
  });

  await t.test('y_min = y_max stops coverage modulating the decay', () => {
    const engine = coverageDecay({
      yMin: 0.3,
      yMax: 0.3,
      vocabularySize: 25,
    });
    const flat = repeatValue(engine, 1, 2);
    assert.ok(Math.abs(flat - 0.3) < 1e-12);
    assert.ok(Math.abs(repeatValue(engine, 25, 2) - flat) < 1e-12);
  });

  await t.test('a one-tile vocabulary scores off y_min', () => {
    // The ramp divides by N - 1, so N = 1 has no range to ramp over.
    const single = coverageDecay({ ...KNOBS, vocabularySize: 1 });
    const wide = coverageDecay({ ...KNOBS, vocabularySize: 25 });
    const b = single(state([4]));
    assert.ok(Number.isFinite(b.score));
    assert.equal(b.varietyPoints, 1);
    assert.ok(
      Math.abs(b.volumePoints - wide(atCoverage(1, 4)).volumePoints) < 1e-12,
    );
  });

  await t.test('rejects knobs the invariants rule out', () => {
    for (const knobs of [
      { yMin: 0.2, yMax: 1 },
      { yMin: 0.2, yMax: 1.4 },
      { yMin: 0.5, yMax: 0.2 },
      { yMin: 0, yMax: 0.5 },
      { yMin: -0.1, yMax: 0.5 },
      { yMin: 0.2, yMax: 0 },
    ]) {
      assert.throws(
        () => coverageDecay({ ...knobs, vocabularySize: 25 }),
        (error: unknown) =>
          error instanceof DomainError && error.kind === 'corrupt',
        `accepted ${JSON.stringify(knobs)}`,
      );
    }
  });
});
