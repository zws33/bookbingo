import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { toDomainError } from '../common/pgErrors.js';
import { getPool, closePool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import { requireTestDatabase, resetDatabase } from './db.js';
import { seedBook, seedChallenge, seedTag, seedUser } from './factories.js';

describe('requireTestDatabase', () => {
  test('accepts a database named for testing', () => {
    requireTestDatabase('postgres://postgres@localhost:5433/bookbingo_test');
  });

  test('refuses a database that is not named for testing', () => {
    assert.throws(
      () =>
        requireTestDatabase('postgres://user@db.example.com:5432/bookbingo'),
      /_test/,
    );
  });

  test('refuses an unset connection string with the command to fix it', () => {
    const configured = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      assert.throws(() => requireTestDatabase(), /DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = configured;
    }
  });
});

describe('the database harness', () => {
  before(() => {
    requireTestDatabase();
  });
  beforeEach(resetDatabase);
  after(closePool);

  test('the schema is applied', async () => {
    const { rows } = await getPool().query<{ count: string }>(
      'select count(*)::text as count from schema_migrations',
    );
    assert.ok(Number(rows[0]?.count) > 0, 'run pnpm run db:migrate');
  });

  test('resetDatabase empties the tables but keeps the migration history', async () => {
    const pool = getPool();
    await seedUser(pool);

    await resetDatabase();

    const users = await pool.query('select 1 from users');
    assert.equal(users.rowCount, 0);
    const applied = await pool.query('select 1 from schema_migrations');
    assert.ok((applied.rowCount ?? 0) > 0);
  });

  test('resetDatabase clears a table a foreign key points at', async () => {
    const pool = getPool();
    const userId = await seedUser(pool);
    const challengeId = await seedChallenge(pool, { createdBy: userId });
    await seedTag(pool, { challengeId });

    await resetDatabase();

    const tags = await pool.query('select 1 from tags');
    assert.equal(tags.rowCount, 0);
  });

  test('withTransaction commits what the callback wrote', async () => {
    const userId = await withTransaction((client) => seedUser(client));

    const { rowCount } = await getPool().query(
      'select 1 from users where id = $1',
      [userId],
    );
    assert.equal(rowCount, 1);
  });

  test('withTransaction rolls back every write when the callback throws', async () => {
    await assert.rejects(
      withTransaction(async (client) => {
        await seedUser(client, { id: 'rolled-back' });
        throw new Error('callback failed');
      }),
      /callback failed/,
    );

    const { rowCount } = await getPool().query('select 1 from users');
    assert.equal(rowCount, 0);
  });

  test('withTransaction returns the connection to the pool after a failure', async () => {
    await assert.rejects(
      withTransaction(() => Promise.reject(new Error('first'))),
      /first/,
    );
    await assert.rejects(
      withTransaction(() => Promise.reject(new Error('second'))),
      /second/,
    );

    assert.equal(
      await withTransaction(() => Promise.resolve('reusable')),
      'reusable',
    );
  });
});

describe('toDomainError against real violations', () => {
  before(() => {
    requireTestDatabase();
  });
  beforeEach(resetDatabase);
  after(closePool);

  test('maps a unique violation by its constraint name', async () => {
    const pool = getPool();
    const userId = await seedUser(pool);
    const challengeId = await seedChallenge(pool, { createdBy: userId });
    await seedTag(pool, { challengeId, label: 'Mystery' });

    const mapped = await seedTag(pool, { challengeId, label: 'mystery' }).then(
      () => undefined,
      (error: unknown) =>
        toDomainError(error, {
          constraints: {
            tags_challenge_label_idx: ['conflict', 'That tag already exists.'],
          },
        }),
    );

    assert.ok(
      mapped instanceof DomainError,
      'expected the duplicate label to be rejected',
    );
    assert.equal(mapped.kind, 'conflict');
    assert.equal(mapped.message, 'That tag already exists.');
  });

  test('maps a non-uuid id to not-found instead of a 500', async () => {
    const mapped = await getPool()
      .query('select 1 from challenges where id = $1', ['not-a-uuid'])
      .then(
        () => undefined,
        (error: unknown) =>
          toDomainError(error, {
            malformedId: 'That challenge no longer exists.',
          }),
      );

    assert.ok(
      mapped instanceof DomainError,
      'expected a malformed uuid to be rejected',
    );
    assert.equal(mapped.kind, 'not-found');
  });

  test('maps a foreign key violation by its constraint name', async () => {
    const mapped = await seedBook(getPool(), { createdBy: 'nobody' }).then(
      () => undefined,
      (error: unknown) =>
        toDomainError(error, {
          constraints: {
            books_created_by_fkey: ['not-found', 'That user no longer exists.'],
          },
        }),
    );

    assert.ok(
      mapped instanceof DomainError,
      'expected the missing user to be rejected',
    );
    assert.equal(mapped.kind, 'not-found');
  });
});
