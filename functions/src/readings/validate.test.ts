import { test, describe } from 'node:test';
import assert from 'node:assert';
import { scoreOf, validateTiles } from './validate.js';
import { TILES } from '../domain/constants.js';
import { MAX_TILES_PER_BOOK } from '../domain/validation.js';

const [t1, t2, t3, t4] = TILES.map((tile) => tile.id);

describe('validateTiles', () => {
  test('accepts a reading at the cap', () => {
    assert.doesNotThrow(() => validateTiles([t1!, t2!, t3!], false));
  });

  test('accepts an empty tile list', () => {
    assert.doesNotThrow(() => validateTiles([], false));
  });

  test('rejects a tile that is not in the catalog', () => {
    assert.throws(() => validateTiles(['not-a-tile'], false), {
      code: 'invalid-argument',
    });
  });

  test('rejects the same tile twice', () => {
    assert.throws(() => validateTiles([t1!, t1!], false), {
      code: 'invalid-argument',
    });
  });

  test(`rejects tile ${MAX_TILES_PER_BOOK + 1} on a non-freebie`, () => {
    assert.throws(() => validateTiles([t1!, t2!, t3!, t4!], false), {
      code: 'invalid-argument',
    });
  });

  test('allows more than the cap on a freebie', () => {
    assert.doesNotThrow(() => validateTiles([t1!, t2!, t3!, t4!], true));
  });

  test('still rejects an unknown tile on a freebie', () => {
    assert.throws(() => validateTiles([t1!, 'not-a-tile'], true), {
      code: 'invalid-argument',
    });
  });
});

describe('scoreOf', () => {
  test('returns a zero score for no readings', () => {
    const score = scoreOf([]);
    assert.equal(score.score, 0);
    assert.equal(score.totalBooks, 0);
    assert.deepEqual(score.tileCounts, {});
  });

  // tileCounts crosses the wire as a Record; a Map would encode as {}.
  test('returns tile counts as a plain object', () => {
    const score = scoreOf([
      { tiles: [t1!, t2!], isFreebie: false },
      { tiles: [t1!], isFreebie: false },
    ]);
    assert.deepEqual(score.tileCounts, { [t1!]: 2, [t2!]: 1 });
    assert.equal(score.totalBooks, 2);
    assert.ok(score.score > 0);
  });
});
