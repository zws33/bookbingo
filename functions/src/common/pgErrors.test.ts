import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from './errors.js';
import { toDomainError } from './pgErrors.js';

/** Duck-typed the way `toDomainError` reads it: a SQLSTATE and a constraint name. */
const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('postgres said no'), { code, constraint });

describe('toDomainError', () => {
  test('maps a named constraint to its declared kind and message', () => {
    const mapped = toDomainError(pgError('23505', 'readings_one_freebie_idx'), {
      constraints: {
        readings_one_freebie_idx: [
          'conflict',
          'You already have a freebie reading.',
        ],
      },
    });

    assert.ok(mapped instanceof DomainError);
    assert.equal(mapped.kind, 'conflict');
    assert.equal(mapped.message, 'You already have a freebie reading.');
  });

  test('carries the constraint and SQLSTATE in details for the failure log', () => {
    const mapped = toDomainError(pgError('23503', 'readings_book_id_fkey'), {
      constraints: {
        readings_book_id_fkey: [
          'not-found',
          'That book is not in the catalog.',
        ],
      },
    });

    assert.ok(mapped instanceof DomainError);
    assert.deepEqual(mapped.details, {
      code: '23503',
      constraint: 'readings_book_id_fkey',
    });
  });

  test('maps a restrict violation, which is 23001 and not 23503', () => {
    const mapped = toDomainError(
      pgError('23001', 'reading_tags_tag_id_challenge_id_fkey'),
      {
        constraints: {
          reading_tags_tag_id_challenge_id_fkey: [
            'conflict',
            'That tag has readings logged against it.',
          ],
        },
      },
    );

    assert.ok(mapped instanceof DomainError);
    assert.equal(mapped.kind, 'conflict');
  });

  test('maps a malformed uuid to not-found', () => {
    const mapped = toDomainError(pgError('22P02'), {
      malformedId: 'That challenge no longer exists.',
    });

    assert.ok(mapped instanceof DomainError);
    assert.equal(mapped.kind, 'not-found');
    assert.equal(mapped.message, 'That challenge no longer exists.');
  });

  test('returns an unmapped constraint unchanged, so it surfaces as a 500', () => {
    const original = pgError('23505', 'some_index_nobody_declared');
    assert.equal(toDomainError(original, { constraints: {} }), original);
  });

  test('returns a malformed uuid unchanged when no message is declared', () => {
    const original = pgError('22P02');
    assert.equal(toDomainError(original, {}), original);
  });

  test('returns a non-postgres error unchanged', () => {
    const original = new Error('socket closed');
    assert.equal(toDomainError(original, { malformedId: 'gone' }), original);
  });

  test('leaves a DomainError thrown inside the callback alone', () => {
    const original = new DomainError('conflict', 'You already have a freebie.');
    assert.equal(toDomainError(original, {}), original);
  });
});
