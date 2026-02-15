import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getTileById } from './tiles.js';

test('getTileById', async (t) => {
  await t.test('returns correct tile for known ID', () => {
    const tile = getTileById('t01');
    assert.ok(tile);
    assert.equal(tile.id, 't01');
    assert.equal(tile.name, 'unfinished reread');
    assert.equal(tile.isManual, false);
  });

  await t.test('returns correct manual tile', () => {
    const tile = getTileById('m01');
    assert.ok(tile);
    assert.equal(tile.id, 'm01');
    assert.equal(tile.isManual, true);
  });

  await t.test('returns undefined for unknown ID', () => {
    assert.equal(getTileById('z99'), undefined);
  });
});
