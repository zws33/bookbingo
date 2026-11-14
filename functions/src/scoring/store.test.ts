import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { DomainError } from '../common/errors.js';
import type { Db } from '../db/transaction.js';
import { scoringConfigRepository } from './store.js';

/**
 * The `corrupt` branch is unreachable through the schema — the check constraint
 * admits only registered names — so it is proven against a stub rather than by
 * dropping the constraint in the db suite.
 */
const returning = (rows: { engine: string }[]): Db => ({
  query: <R extends pg.QueryResultRow>() =>
    Promise.resolve({ rows: rows as unknown as R[] } as pg.QueryResult<R>),
});

describe('scoringConfigRepository.getEngine', () => {
  test('defaults when the challenge has no row', async () => {
    const engine = await scoringConfigRepository(returning([])).getEngine('c1');
    assert.equal(engine, 'COVERAGE_DECAY');
  });

  test('returns a registered engine', async () => {
    const engine = await scoringConfigRepository(
      returning([{ engine: 'SHIFTED_HARMONIC' }]),
    ).getEngine('c1');
    assert.equal(engine, 'SHIFTED_HARMONIC');
  });

  test('refuses an engine this deployment does not implement', async () => {
    // A row written by a newer deployment. Defaulting would score the
    // challenge with an engine its owner did not choose.
    await assert.rejects(
      scoringConfigRepository(
        returning([{ engine: 'FUTURE_ENGINE' }]),
      ).getEngine('c1'),
      (error: unknown) =>
        error instanceof DomainError && error.kind === 'corrupt',
    );
  });
});
