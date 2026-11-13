import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ScoringInput } from '@bookbingo/lib-types';
import { DomainError } from '../common/errors.js';
import type { ScoringEngine } from './engine.js';
import { requireParamsInBounds, shiftedHarmonic } from './shiftedHarmonic.js';
import { harmonicSum } from './statistics.js';

/**
 * The calibration cases run at N = 49 because that is the vocabulary the agreed
 * targets were derived at: a 30-tag reader's books 2-5 worth .63/.42/.32/.25.
 */
const N = 49;

/** `counts[i]` books under tag `i`, one tag per book. */
function state(counts: number[]): ScoringInput[] {
  const readings: ScoringInput[] = [];
  counts.forEach((count, tag) => {
    for (let n = 0; n < count; n++) {
      readings.push({ tags: [`t${tag}`], isFreebie: false });
    }
  });
  return readings;
}

/** `k` tags covered, one of them holding `depth` books. */
function atCoverage(k: number, depth: number): ScoringInput[] {
  return state([depth, ...Array(k - 1).fill(1)]);
}

function repeatValue(engine: ScoringEngine, k: number, j: number): number {
  return engine(atCoverage(k, j)).score - engine(atCoverage(k, j - 1)).score;
}

/**
 * The ramp written out independently of the engine, with the live constants
 * inline: a calibration case that silently followed a changed `y_min` would
 * pin nothing.
 */
function expectedY(k: number, tagsCount: number): number {
  if (tagsCount <= 1) {
    return 0.45;
  }
  return 0.45 + (0.75 - 0.45) * ((k - 1) / (tagsCount - 1));
}

const randomInt = (bound: number) => Math.floor(Math.random() * bound);

function pickDistinct(howMany: number, bound: number): Set<number> {
  const picked = new Set<number>();
  while (picked.size < howMany) picked.add(randomInt(bound));
  return picked;
}

function bump(counts: number[], tags: number[]): number[] {
  const next = [...counts];
  for (const tag of tags) next[tag] = next[tag]! + 1;
  return next;
}

test('shiftedHarmonic', async (t) => {
  await t.test('scores an empty reading list as zero', () => {
    const b = shiftedHarmonic(N)([]);
    assert.equal(b.score, 0);
    assert.equal(b.varietyPoints, 0);
    assert.equal(b.volumePoints, 0);
    assert.equal(b.totalBooks, 0);
    assert.equal(b.tagCounts.size, 0);
  });

  await t.test('counts a book that claims no tag, and scores it zero', () => {
    const b = shiftedHarmonic(N)([{ tags: [], isFreebie: false }]);
    assert.equal(b.totalBooks, 1);
    assert.equal(b.score, 0);
  });

  await t.test('a freebie scores as the single-tag books it claims', () => {
    const engine = shiftedHarmonic(N);
    const freebie = engine([{ tags: ['t0', 't1', 't2'], isFreebie: true }]);
    assert.equal(freebie.score, engine(state([1, 1, 1])).score);
  });

  await t.test('counts every tag a book claims', () => {
    const b = shiftedHarmonic(N)([
      { tags: ['a', 'b'], isFreebie: false },
      { tags: ['b', 'c'], isFreebie: false },
    ]);
    assert.equal(b.tagCounts.get('a'), 1);
    assert.equal(b.tagCounts.get('b'), 2);
    assert.equal(b.tagCounts.get('c'), 1);
    assert.equal(b.varietyPoints, 3);
    assert.equal(b.totalBooks, 2);
  });

  await t.test('calibration', async (t) => {
    await t.test('rho(2) is exactly y, at every coverage', () => {
      // (y * shift) / shift with shift = 2: both steps are exact in binary.
      for (const k of [1, 2, 5, 30, N]) {
        const b = shiftedHarmonic(N)(atCoverage(k, 2));
        assert.equal(b.volumePoints, expectedY(k, N), `at k=${k}`);
      }
    });

    await t.test('rho(shift + 2) is half of rho(2)', () => {
      const engine = shiftedHarmonic(N);
      for (const k of [1, 5, 30, N]) {
        const y = expectedY(k, N);
        assert.ok(
          Math.abs(repeatValue(engine, k, 4) - y / 2) < 1e-12,
          `rho(4) at k=${k} was ${repeatValue(engine, k, 4)}, wanted ${y / 2}`,
        );
      }
    });

    await t.test('the 30-tag reader hits the agreed targets', () => {
      const engine = shiftedHarmonic(N);
      const expected = [0.631, 0.421, 0.316, 0.253];
      expected.forEach((want, index) => {
        const got = repeatValue(engine, 30, index + 2);
        assert.ok(
          Math.abs(got - want) < 5e-4,
          `rho(${index + 2}) was ${got}, wanted ~${want}`,
        );
      });
    });

    await t.test('the ratios between repeats do not move with coverage', () => {
      // rho(j) = y*a/(j-2+a), so rho(3)/rho(2) = a/(1+a) whatever y is.
      const engine = shiftedHarmonic(N);
      for (const k of [1, 5, 30, N]) {
        const ratio = repeatValue(engine, k, 3) / repeatValue(engine, k, 2);
        assert.ok(
          Math.abs(ratio - 2 / 3) < 1e-9,
          `at k=${k} ratio was ${ratio}`,
        );
      }
    });

    await t.test('one tag of depth d sums to 2y(H(d) - 1)', () => {
      const engine = shiftedHarmonic(N);
      for (const depth of [2, 5, 31, 200]) {
        const b = engine(atCoverage(1, depth));
        const want = 2 * expectedY(1, N) * (harmonicSum(depth) - 1);
        assert.ok(
          Math.abs(b.volumePoints - want) < 1e-12,
          `depth ${depth} gave ${b.volumePoints}, wanted ${want}`,
        );
      }
    });

    await t.test('no ceiling: volume keeps growing with depth', () => {
      // The counterpart of coverage-decay's convergence case, which caps near
      // 0.42 however deep the tag goes.
      const engine = shiftedHarmonic(N);
      const deep = engine(atCoverage(1, 100000)).volumePoints;
      const shallow = engine(atCoverage(1, 5000)).volumePoints;
      assert.ok(deep > shallow, `${deep} did not exceed ${shallow}`);
      assert.ok(deep > 9, `got ${deep}`);
    });

    await t.test('coverage beats depth at every scale', () => {
      // Volume is logarithmic in depth, variety linear in coverage, so a
      // single tag read 1000 deep stays behind 30 tags touched once.
      const engine = shiftedHarmonic(N);
      assert.ok(
        engine(atCoverage(1, 1000)).score < engine(atCoverage(30, 1)).score,
      );
    });
  });

  await t.test('I1 — every book strictly increases the score', () => {
    const engine = shiftedHarmonic(25);
    let smallest = Infinity;

    for (let trial = 0; trial < 5000; trial++) {
      const counts = [
        1 + randomInt(12),
        ...Array.from({ length: 24 }, () => randomInt(13)),
      ];
      const before = engine(state(counts)).score;

      const covered = counts.flatMap((count, i) => (count > 0 ? [i] : []));
      const uncovered = counts.flatMap((count, i) => (count === 0 ? [i] : []));

      const moves: number[][] = [
        bump(counts, [covered[randomInt(covered.length)]!]),
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
    const engine = shiftedHarmonic(N);
    for (const k of [1, 2, 5, 30, N]) {
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
    const engine = shiftedHarmonic(N);
    for (let j = 2; j <= 6; j++) {
      for (let k = 2; k <= N; k++) {
        assert.ok(
          repeatValue(engine, k, j) > repeatValue(engine, k - 1, j),
          `rho(${j}) did not rise from k=${k - 1} to k=${k}`,
        );
      }
    }
  });

  await t.test('a one-tag vocabulary scores off y_min', () => {
    const single = shiftedHarmonic(1);
    const wide = shiftedHarmonic(N);
    const b = single(state([4]));
    assert.ok(Number.isFinite(b.score));
    assert.equal(b.varietyPoints, 1);
    assert.equal(b.volumePoints, wide(atCoverage(1, 4)).volumePoints);
  });

  await t.test('rejects parameters the invariants rule out', () => {
    for (const [yMin, yMax, shift] of [
      [0.2, 1, 2],
      [0.2, 1.4, 2],
      [0.5, 0.2, 2],
      [0, 0.5, 2],
      [-0.1, 0.5, 2],
      [0.2, 0, 2],
      [0.45, 0.75, 0],
      [0.45, 0.75, -1],
      [0.45, 0.75, NaN],
      [NaN, 0.75, 2],
    ]) {
      assert.throws(
        () => requireParamsInBounds(yMin!, yMax!, shift!),
        (error: unknown) =>
          error instanceof DomainError && error.kind === 'corrupt',
        `accepted y_min=${yMin}, y_max=${yMax}, shift=${shift}`,
      );
    }
  });

  await t.test('accepts the parameter space the curve is defined on', () => {
    // shift >= 1 is a preference, not an invariant, so a fractional shift and
    // a flat ramp both have to pass.
    requireParamsInBounds(0.45, 0.75, 2);
    requireParamsInBounds(0.2, 0.9, 1);
    requireParamsInBounds(0.3, 0.3, 0.5);
  });
});
