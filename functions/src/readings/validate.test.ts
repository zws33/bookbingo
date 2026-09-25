import { test, describe } from 'node:test';
import assert from 'node:assert';
import { scoreOf, validateReadingTiles, validateTileIds } from './validate.js';
import { TILES } from '../domain/constants.js';

/** A vocabulary of its own, so a function reading the global catalog fails here. */
const VALID = new Set(['a1', 'a2', 'a3', 'a4']);
const CAP = 3;

const invalidInput = { name: 'DomainError', kind: 'invalid-input' };

describe('validateTileIds', () => {
  test('accepts an empty tile list', () => {
    assert.doesNotThrow(() => validateTileIds([], VALID));
  });

  test('rejects a tile the vocabulary does not contain', () => {
    assert.throws(() => validateTileIds(['not-a-tile'], VALID), invalidInput);
  });

  test('rejects a catalog tile absent from the vocabulary it was given', () => {
    const catalogTile = TILES[0]!.id;
    assert.throws(() => validateTileIds([catalogTile], VALID), invalidInput);
  });

  test('rejects the same tile twice', () => {
    assert.throws(() => validateTileIds(['a1', 'a1'], VALID), invalidInput);
  });

  // A plan is not a reading: the cap applies when it becomes one.
  test('does not apply the reading cap', () => {
    assert.doesNotThrow(() => validateTileIds(['a1', 'a2', 'a3', 'a4'], VALID));
  });
});

describe('validateReadingTiles', () => {
  test('accepts a reading at the cap', () => {
    assert.doesNotThrow(() =>
      validateReadingTiles(['a1', 'a2', 'a3'], false, VALID, CAP),
    );
  });

  test('rejects one tile over the cap on a non-freebie', () => {
    assert.throws(
      () => validateReadingTiles(['a1', 'a2', 'a3', 'a4'], false, VALID, CAP),
      invalidInput,
    );
  });

  test('reports the cap it was given, not a hardcoded one', () => {
    assert.throws(
      () => validateReadingTiles(['a1', 'a2'], false, VALID, 1),
      /at most 1 tiles/,
    );
  });

  test('allows more than the cap on a freebie', () => {
    assert.doesNotThrow(() =>
      validateReadingTiles(['a1', 'a2', 'a3', 'a4'], true, VALID, CAP),
    );
  });

  test('still rejects an unknown tile on a freebie', () => {
    assert.throws(
      () => validateReadingTiles(['a1', 'not-a-tile'], true, VALID, CAP),
      invalidInput,
    );
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
      { tiles: ['a1', 'a2'], isFreebie: false },
      { tiles: ['a1'], isFreebie: false },
    ]);
    assert.deepEqual(score.tileCounts, { a1: 2, a2: 1 });
    assert.equal(score.totalBooks, 2);
    assert.ok(score.score > 0);
  });
});
