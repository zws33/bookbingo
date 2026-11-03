import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateDistinctTags, validateReadingTags } from './validate.js';

const CAP = 3;

const invalidInput = { name: 'DomainError', kind: 'invalid-input' };

describe('validateDistinctTags', () => {
  test('accepts an empty tag list', () => {
    assert.doesNotThrow(() => validateDistinctTags([]));
  });

  test('accepts distinct tags', () => {
    assert.doesNotThrow(() => validateDistinctTags(['a1', 'a2', 'a3']));
  });

  test('rejects the same tag twice', () => {
    assert.throws(() => validateDistinctTags(['a1', 'a1']), invalidInput);
  });

  // The vocabulary is the database's job: an unknown tag fails the foreign key.
  test('accepts a tag it cannot know is unknown', () => {
    assert.doesNotThrow(() => validateDistinctTags(['not-a-tag']));
  });

  // A plan is not a reading: the cap applies when it becomes one.
  test('does not apply the reading cap', () => {
    assert.doesNotThrow(() =>
      validateDistinctTags(['a1', 'a2', 'a3', 'a4', 'a5']),
    );
  });
});

describe('validateReadingTags', () => {
  test('accepts a reading at the cap', () => {
    assert.doesNotThrow(() =>
      validateReadingTags(['a1', 'a2', 'a3'], false, CAP),
    );
  });

  test('rejects one tag over the cap on a non-freebie', () => {
    assert.throws(
      () => validateReadingTags(['a1', 'a2', 'a3', 'a4'], false, CAP),
      invalidInput,
    );
  });

  test('reports the cap it was given, not a hardcoded one', () => {
    assert.throws(
      () => validateReadingTags(['a1', 'a2'], false, 1),
      /at most 1 tags/,
    );
  });

  test('allows more than the cap on a freebie', () => {
    assert.doesNotThrow(() =>
      validateReadingTags(['a1', 'a2', 'a3', 'a4'], true, CAP),
    );
  });

  test('still rejects a duplicate tag on a freebie', () => {
    assert.throws(
      () => validateReadingTags(['a1', 'a1'], true, CAP),
      invalidInput,
    );
  });

  test('rejects a freebie with no tags', () => {
    assert.throws(() => validateReadingTags([], true, CAP), invalidInput);
  });

  test('accepts a non-freebie with no tags', () => {
    assert.doesNotThrow(() => validateReadingTags([], false, CAP));
  });
});
