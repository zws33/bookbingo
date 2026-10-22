import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importId } from './ids.js';

describe('importId', () => {
  it('is stable for a path, so a rerun upserts rather than duplicates', () => {
    assert.equal(
      importId('users/abc/readings/xyz'),
      importId('users/abc/readings/xyz'),
    );
  });

  it('is a uuid v5', () => {
    assert.match(
      importId('users/abc/readings/xyz'),
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('separates a reading from the TBR entry it was promoted from', () => {
    assert.notEqual(
      importId('users/abc/readings/xyz'),
      importId('users/abc/tbr/xyz'),
    );
  });

  it('separates the same document id under two users', () => {
    assert.notEqual(
      importId('users/one/readings/xyz'),
      importId('users/two/readings/xyz'),
    );
  });
});
