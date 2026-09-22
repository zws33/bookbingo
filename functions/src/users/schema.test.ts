import { test, describe } from 'node:test';
import assert from 'node:assert';
import { UserProfileDocSchema } from './schema.js';

describe('UserProfileDocSchema', () => {
  test('replaces a stored null name with the fallback', () => {
    assert.equal(UserProfileDocSchema.parse({ name: null }).name, 'User');
  });
});
