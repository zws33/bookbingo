import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { toDomainError } from '../common/pgErrors.js';
import { inTransaction } from '../db/transaction.js';
import {
  connectTestDatabase,
  requireTestDatabaseUrl,
  type TestDatabase,
} from './db.js';
import { seedBook, seedChallenge, seedTag, seedUser } from './factories.js';

const LOCAL = 'postgres://postgres:postgres@localhost:5433';

describe('requireTestDatabaseUrl', () => {
  test('returns a url naming a database for testing', () => {
    const url = `${LOCAL}/bookbingo_test`;
    assert.equal(requireTestDatabaseUrl(url), url);
  });

  test('refuses a database that is not named for testing', () => {
    assert.throws(
      () =>
        requireTestDatabaseUrl('postgres://user@db.example.com:5432/bookbingo'),
      /_test/,
    );
  });

  test('refuses a connection string that is not a url', () => {
    assert.throws(
      () => requireTestDatabaseUrl('host=localhost dbname=bookbingo_test'),
      /postgres:\/\/ URL/,
    );
  });

  test('names TEST_DATABASE_URL, not DATABASE_URL, when it is unset', () => {
    const configured = process.env.TEST_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    try {
      assert.throws(() => requireTestDatabaseUrl(), /TEST_DATABASE_URL/);
    } finally {
      process.env.TEST_DATABASE_URL = configured;
    }
  });
});

describe('the database harness', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  test('the schema is applied', async () => {
    const { rows } = await testDb.db.query<{ count: string }>(
      'select count(*)::text as count from schema_migrations',
    );
    assert.ok(Number(rows[0]?.count) > 0, 'run pnpm run db:migrate');
  });

  test('hands back the same handle for the whole process', async () => {
    assert.equal(await connectTestDatabase(), testDb);
  });

  test('refuses a database without the marker, however it is named', async () => {
    await testDb.db.query('create database bookbingo_unmarked_test');

    try {
      await assert.rejects(
        connectTestDatabase(`${LOCAL}/bookbingo_unmarked_test`),
        /marker/,
      );
    } finally {
      await testDb.db.query(
        'drop database bookbingo_unmarked_test with (force)',
      );
    }
  });

  test('reset empties the tables but keeps the migration history', async () => {
    await seedUser(testDb.db);

    await testDb.reset();

    const users = await testDb.db.query('select 1 from users');
    assert.equal(users.rowCount, 0);
    const applied = await testDb.db.query('select 1 from schema_migrations');
    assert.ok((applied.rowCount ?? 0) > 0);
  });

  test('reset clears a table a foreign key points at', async () => {
    const userId = await seedUser(testDb.db);
    const challengeId = await seedChallenge(testDb.db, { createdBy: userId });
    await seedTag(testDb.db, { challengeId });

    await testDb.reset();

    const tags = await testDb.db.query('select 1 from tags');
    assert.equal(tags.rowCount, 0);
  });

  test('inTransaction commits what the callback wrote', async () => {
    const userId = await inTransaction(testDb.db, (client) => seedUser(client));

    const { rowCount } = await testDb.db.query(
      'select 1 from users where id = $1',
      [userId],
    );
    assert.equal(rowCount, 1);
  });

  test('inTransaction rolls back every write when the callback throws', async () => {
    await assert.rejects(
      inTransaction(testDb.db, async (client) => {
        await seedUser(client, { id: 'rolled-back' });
        throw new Error('callback failed');
      }),
      /callback failed/,
    );

    const { rowCount } = await testDb.db.query('select 1 from users');
    assert.equal(rowCount, 0);
  });

  test('inTransaction returns the connection to the pool after a failure', async () => {
    await assert.rejects(
      inTransaction(testDb.db, () => Promise.reject(new Error('first'))),
      /first/,
    );
    await assert.rejects(
      inTransaction(testDb.db, () => Promise.reject(new Error('second'))),
      /second/,
    );

    assert.equal(
      await inTransaction(testDb.db, () => Promise.resolve('reusable')),
      'reusable',
    );
  });

  test('inTransaction joins a transaction already open', async () => {
    await assert.rejects(
      inTransaction(testDb.db, async (client) => {
        await inTransaction(client, (inner) =>
          seedUser(inner, { id: 'inner' }),
        );
        throw new Error('outer rolled back');
      }),
      /outer rolled back/,
    );

    const { rowCount } = await testDb.db.query('select 1 from users');
    assert.equal(
      rowCount,
      0,
      'the inner write must not have committed on its own',
    );
  });
});

describe('toDomainError against real violations', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  test('maps a unique violation by its constraint name', async () => {
    const userId = await seedUser(testDb.db);
    const challengeId = await seedChallenge(testDb.db, { createdBy: userId });
    await seedTag(testDb.db, { challengeId, label: 'Mystery' });

    const mapped = await seedTag(testDb.db, {
      challengeId,
      label: 'mystery',
    }).then(
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
    const mapped = await testDb.db
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
    const mapped = await seedBook(testDb.db, { createdBy: 'nobody' }).then(
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
