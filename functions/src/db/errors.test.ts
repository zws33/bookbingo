import { test, describe } from 'node:test';
import assert from 'node:assert';
import { classifyDbFailure } from './errors.js';
import { DomainError } from '../common/errors.js';
import { toDomainError } from '../common/pgErrors.js';

const FIELDS = { repository: 'challenges', operation: 'create' };

const RULES = {
  constraints: {
    memberships_challenge_id_fkey: ['not-found', 'That challenge is gone.'],
  } as const,
  malformedId: 'That challenge is gone.',
};

function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error('violates constraint'), {
    code,
    ...(constraint !== undefined && { constraint }),
  });
}

const classify = (error: unknown) =>
  classifyDbFailure(error, toDomainError(error, RULES), FIELDS);

describe('classifyDbFailure', () => {
  test('a claimed violation is a rejection, carrying the sqlstate and constraint', () => {
    const { level, fields } = classify(
      pgError('23503', 'memberships_challenge_id_fkey'),
    );

    assert.equal(level, 'rejected');
    assert.deepEqual(fields, {
      ...FIELDS,
      sqlstate: '23503',
      constraint: 'memberships_challenge_id_fkey',
      kind: 'not-found',
    });
  });

  test('a malformed id is a rejection even though no constraint names it', () => {
    const { level, fields } = classify(pgError('22P02'));

    assert.equal(level, 'rejected');
    assert.equal(fields.sqlstate, '22P02');
    assert.equal(fields.constraint, undefined);
    assert.equal(fields.kind, 'not-found');
  });

  test('a violation no rule claims is a failure, not a rejection', () => {
    const { level, fields } = classify(pgError('23505', 'tags_label_key'));

    assert.equal(level, 'failed');
    assert.deepEqual(fields, {
      ...FIELDS,
      sqlstate: '23505',
      constraint: 'tags_label_key',
    });
  });

  test('an infrastructure error is a failure', () => {
    const { level, fields } = classify(pgError('ECONNREFUSED'));

    assert.equal(level, 'failed');
    assert.equal(fields.sqlstate, 'ECONNREFUSED');
  });

  test("the repository's own DomainError is silent — nothing broke", () => {
    const own = new DomainError('not-found', 'That challenge is gone.');

    const { level, fields } = classifyDbFailure(own, own, FIELDS);

    assert.equal(level, 'silent');
    assert.deepEqual(fields, FIELDS);
  });

  test('a throw that is not an Error at all is silent here', () => {
    const { level } = classifyDbFailure('boom', 'boom', FIELDS);

    assert.equal(level, 'silent');
  });

  test('an Error with no code is silent — it did not come from pg', () => {
    const plain = new Error('insert into tags returned no id');

    const { level } = classifyDbFailure(plain, plain, FIELDS);

    assert.equal(level, 'silent');
  });
});
