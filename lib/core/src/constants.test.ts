import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TILES } from './constants.js';

// The book-assignable / manual split is carried entirely by the id prefix — `Tile`
// has no field for it and nothing at runtime branches on it. These assertions are
// the only thing holding the convention in place.
test('TILES', async (t) => {
  const bookAssignable = TILES.filter((tile) => tile.id.startsWith('t'));
  const manual = TILES.filter((tile) => tile.id.startsWith('m'));

  await t.test('has 49 tiles: 43 book-assignable, 6 manual', () => {
    assert.equal(TILES.length, 49);
    assert.equal(bookAssignable.length, 43);
    assert.equal(manual.length, 6);
  });

  await t.test('every tile carries a known prefix', () => {
    assert.equal(bookAssignable.length + manual.length, TILES.length);
  });

  await t.test('ids are unique', () => {
    // Scoring keys its tile counts by id and getTileById returns the first match,
    // so a duplicate would silently merge two categories.
    assert.equal(new Set(TILES.map((tile) => tile.id)).size, TILES.length);
  });

  await t.test('names are non-empty', () => {
    for (const tile of TILES) {
      assert.ok(tile.name.length > 0, `tile ${tile.id} has an empty name`);
    }
  });
});
