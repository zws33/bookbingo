import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DomainError } from './errors.js';
import { requireCompleteScan } from './limits.js';

const docs = (count: number): readonly unknown[] =>
  Array.from({ length: count }, (_, index) => index);

describe('requireCompleteScan', () => {
  test('accepts a read that exactly fills the cap', () => {
    assert.doesNotThrow(() => requireCompleteScan('readings', docs(10), 10));
  });

  test('rejects the cap-plus-one read a caller fetches to detect truncation', () => {
    assert.throws(
      () => requireCompleteScan('readings', docs(11), 10),
      (error: unknown) =>
        error instanceof DomainError &&
        error.kind === 'corrupt' &&
        error.details['collection'] === 'readings',
    );
  });
});
