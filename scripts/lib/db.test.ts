import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTarget, resolveDatabaseTarget, sslFor } from './db.js';

const LOCAL = 'postgres://postgres:postgres@localhost:5433/bookbingo_test';
const REMOTE = 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require';

test('resolveDatabaseTarget', async (t) => {
  await t.test('defaults to TEST_DATABASE_URL', () => {
    assert.deepEqual(resolveDatabaseTarget([], { TEST_DATABASE_URL: LOCAL }), {
      url: LOCAL,
      source: 'TEST_DATABASE_URL',
    });
  });

  await t.test('prefers --database-url', () => {
    assert.deepEqual(
      resolveDatabaseTarget(['--database-url', REMOTE], {
        TEST_DATABASE_URL: LOCAL,
      }),
      { url: REMOTE, source: '--database-url' },
    );
  });

  await t.test('accepts --database-url=<url>', () => {
    assert.equal(
      resolveDatabaseTarget([`--database-url=${REMOTE}`], {}).url,
      REMOTE,
    );
  });

  await t.test('ignores DATABASE_URL entirely', () => {
    assert.throws(
      () => resolveDatabaseTarget([], { DATABASE_URL: REMOTE }),
      /No connection URL/,
    );
  });

  await t.test('reads past the other flags a script takes', () => {
    assert.equal(
      resolveDatabaseTarget(
        ['--project', 'bookbingo-prod', '--database-url', REMOTE, '--dry-run'],
        { TEST_DATABASE_URL: LOCAL },
      ).url,
      REMOTE,
    );
  });

  await t.test('does not mistake a flag value for the URL', () => {
    assert.deepEqual(
      resolveDatabaseTarget(['--project', 'bookbingo-prod'], {
        TEST_DATABASE_URL: LOCAL,
      }),
      { url: LOCAL, source: 'TEST_DATABASE_URL' },
    );
  });

  await t.test('rejects a bare URL rather than guessing', () => {
    assert.throws(
      () => resolveDatabaseTarget([REMOTE], {}),
      /not as a bare argument/,
    );
  });

  await t.test('rejects a flag with no value', () => {
    assert.throws(
      () => resolveDatabaseTarget(['--database-url'], {}),
      /was given no value/,
    );
    assert.throws(
      () => resolveDatabaseTarget(['--database-url', '--dry-run'], {}),
      /was given no value/,
    );
    assert.throws(
      () => resolveDatabaseTarget(['--database-url='], {}),
      /was given no value/,
    );
  });

  await t.test('rejects a non-URL value', () => {
    assert.throws(
      () => resolveDatabaseTarget(['--database-url', 'bookbingo_test'], {}),
      /from --database-url is not a URL/,
    );
  });

  await t.test('rejects a non-postgres scheme', () => {
    assert.throws(
      () =>
        resolveDatabaseTarget(['--database-url', 'https://example.com/db'], {}),
      /from --database-url is https:\/\/, not postgres/,
    );
  });

  await t.test('names TEST_DATABASE_URL as the source of a bad default', () => {
    assert.throws(
      () => resolveDatabaseTarget([], { TEST_DATABASE_URL: 'not-a-url' }),
      /from TEST_DATABASE_URL is not a URL/,
    );
  });
});

test('sslFor is off for loopback and verified elsewhere', () => {
  assert.equal(sslFor(LOCAL), false);
  assert.deepEqual(sslFor(REMOTE), { rejectUnauthorized: true });
});

test('describeTarget omits the password', () => {
  assert.equal(describeTarget(REMOTE), 'ep-x.neon.tech/neondb as u');
  assert.equal(
    describeTarget(LOCAL),
    'localhost:5433/bookbingo_test as postgres',
  );
});
