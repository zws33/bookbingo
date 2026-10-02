import { getPool } from '../db/pool.js';

/**
 * The only thing between this suite and a real database: `resetDatabase`
 * truncates every table it finds, so the connection string is checked before
 * any test runs rather than trusted.
 */
export function requireTestDatabase(
  url: string | undefined = process.env.DATABASE_URL,
): void {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Start the container with `docker compose up -d --wait`, ' +
        'copy functions/.env.example to functions/.env.local, then run `pnpm run test:db`.',
    );
  }

  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run against "${database}": the database name must end in _test.`,
    );
  }
}

/**
 * Read from the catalog rather than listed here, so a new migration needs no
 * edit. `cascade` covers the foreign keys; `schema_migrations` is kept because
 * the schema is applied once per run, not once per test.
 */
let tableList: string | undefined;

async function truncatableTables(): Promise<string> {
  if (tableList) return tableList;

  const { rows } = await getPool().query<{ tables: string | null }>(
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

  tableList = tables;
  return tables;
}

/**
 * `test:db` passes `--test-concurrency=1`. Without it node:test runs the files in
 * parallel processes against the one database, where the truncates deadlock
 * against each other and a seed from one file disappears mid-test under
 * another's reset.
 */
export async function resetDatabase(): Promise<void> {
  await getPool().query(`truncate table ${await truncatableTables()} cascade`);
}
