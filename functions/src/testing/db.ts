import pg from 'pg';
import type { Db } from '../db/transaction.js';

const { Pool } = pg;

/**
 * A connection to a database proven disposable. `reset` is reachable only
 * through this handle, so the check cannot be skipped by forgetting a hook.
 */
export interface TestDatabase {
  readonly db: Db;
  /** Empties every table. The schema and `schema_migrations` survive. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * `TEST_DATABASE_URL`, not `DATABASE_URL`: the harness truncates every table
 * between tests, so it reads a different variable than the application does and
 * cannot reach whatever the application is pointed at. That decoupling is the
 * guarantee; the `_test` suffix is what keeps a staging or prod URL pasted into
 * `.env.local` from being accepted, so those databases are never named `*_test`.
 */
export function requireTestDatabaseUrl(
  url: string | undefined = process.env.TEST_DATABASE_URL,
): string {
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start the container with `docker compose up -d --wait`, ' +
        'copy functions/.env.example to functions/.env.local, then run `pnpm run test:db`.',
    );
  }

  let database: string;
  try {
    database = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(
      'TEST_DATABASE_URL must be a postgres:// URL, not pg keyword/value form.',
    );
  }

  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run against "${database}": the database name must end in _test.`,
    );
  }

  return url;
}

/**
 * Read from the catalog rather than listed here, so a new migration needs no
 * edit. `format('%I')` quotes server-side, so the interpolated string is
 * already-escaped SQL. `schema_migrations` is kept: the schema is applied once
 * per run by `db:migrate`, not once per test.
 */
async function truncatableTables(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ tables: string | null }>(
    `select string_agg(format('%I', tablename), ', ') as tables
       from pg_tables
      where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );

  const tables = rows[0]?.tables;
  if (!tables) {
    throw new Error(
      'The test database has no tables. Run `pnpm run db:migrate` first.',
    );
  }

  return tables;
}

let connecting: Promise<TestDatabase> | undefined;

/**
 * Memoized per process, so the describes in one file share a pool and a repeated
 * `close` is a no-op. `test:db` passes `--test-concurrency=1`: node:test runs
 * the files in parallel processes, where the truncates deadlock against each
 * other and a seed from one file disappears mid-test under another's reset.
 */
export function connectTestDatabase(url?: string): Promise<TestDatabase> {
  const target = requireTestDatabaseUrl(url);
  // An explicit target is the caller's to manage, so only the default is shared.
  if (url !== undefined) return connect(target);
  connecting ??= connect(target);
  return connecting;
}

async function connect(url: string): Promise<TestDatabase> {
  const { hostname } = new URL(url);
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

  const pool = new Pool({
    connectionString: url,
    ssl: isLoopback ? false : { rejectUnauthorized: true },
    max: 4,
  });

  try {
    // Eager, so an unreachable database fails here rather than inside the first
    // test, and a broken pool is never left memoized.
    await pool.query('select 1');
  } catch (error) {
    await pool.end();
    if (connecting) connecting = undefined;
    throw error;
  }

  let tables: string | undefined;
  let closed = false;

  return {
    db: pool,

    async reset() {
      // No `cascade`: every table is named already, so cascade only adds the
      // chance of reaching one this list forgot.
      tables ??= await truncatableTables(pool);
      await pool.query(`truncate table ${tables}`);
    },

    async close() {
      if (closed) return;
      closed = true;
      connecting = undefined;
      await pool.end();
    },
  };
}
