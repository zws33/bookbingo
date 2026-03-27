import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getTileById } from './tiles.js';

test('getTileById', async (t) => {
  await t.test('returns correct tile for known ID', () => {
    const tile = getTileById('t01');
    assert.ok(tile);
    assert.equal(tile.id, 't01');
    assert.equal(tile.name, 'unfinished reread');
  });

  await t.test('returns tile with m-prefix ID', () => {
    const tile = getTileById('m01');
    assert.ok(tile);
    assert.equal(tile.id, 'm01');
  });

  await t.test('returns undefined for unknown ID', () => {
    assert.equal(getTileById('z99'), undefined);
  });
});
