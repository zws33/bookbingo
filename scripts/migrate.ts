/**
 * Applies `db/migrations/*.sql` in order, once each.
 *
 * Usage:
 *   pnpm run db:migrate                     # TEST_DATABASE_URL
 *   pnpm run db:migrate -- --dry-run
 *   pnpm run db:migrate -- --database-url 'postgres://…neon…/bookbingo'
 *
 * A remote database is only ever reached by naming it on the command line.
 */

import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';
import {
  createClient,
  describeTarget,
  resolveDatabaseTarget,
  sslFor,
} from './lib/db.js';
import {
  checksumOf,
  parseMigrationFilename,
  pendingMigrations,
  type AppliedMigration,
  type MigrationFile,
} from './lib/migrations.js';

const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url);

const DRY_RUN = process.argv.includes('--dry-run');

function log(label: string, message: string): void {
  console.log(`${label.padEnd(10)} ${message}`);
}

function elapsed(since: number): string {
  const ms = Date.now() - since;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** pg puts the part that identifies a constraint or syntax error on the error, not in its message. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const { code, detail, hint, position, where } = error as Error & {
    code?: string;
    detail?: string;
    hint?: string;
    position?: string;
    where?: string;
  };

  return [
    code ? `${error.message} [SQLSTATE ${code}]` : error.message,
    detail && `detail: ${detail}`,
    hint && `hint: ${hint}`,
    position && `at character ${position}`,
    where && `where: ${where}`,
  ]
    .filter(Boolean)
    .join('\n  ');
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const filenames = (await readdir(MIGRATIONS_DIR)).filter((name) =>
    name.endsWith('.sql'),
  );

  return Promise.all(
    filenames.map(async (filename) => {
      const { version, name } = parseMigrationFilename(filename);
      const sql = await readFile(new URL(filename, MIGRATIONS_DIR), 'utf8');
      return { version, name, sql, checksum: checksumOf(sql) };
    }),
  );
}

async function ensureMigrationsTableExists(client: pg.Client): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function readApplied(client: pg.Client): Promise<AppliedMigration[]> {
  await ensureMigrationsTableExists(client);

  const { rows } = await client.query<AppliedMigration>(
    'select version, name, checksum from schema_migrations',
  );
  return rows;
}

/**
 * The migration's own error is the one worth reading, so a failed rollback is
 * reported rather than thrown: it would replace a syntax or constraint error
 * with a connection error.
 */
async function rollback(client: pg.Client): Promise<boolean> {
  try {
    await client.query('rollback');
    return true;
  } catch {
    return false;
  }
}

async function apply(
  client: pg.Client,
  migration: MigrationFile,
): Promise<void> {
  const label = `${migration.version}_${migration.name}`;
  const started = Date.now();

  await client.query('begin');
  try {
    await client.query(migration.sql);
    await client.query(
      'insert into schema_migrations (version, name, checksum) values ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum],
    );
    await client.query('commit');
    log('applied', `${label} (${elapsed(started)})`);
  } catch (error) {
    const message = (await rollback(client))
      ? `Migration ${label} failed after ${elapsed(started)} and was rolled back.`
      : `Migration ${label} failed after ${elapsed(started)}, and so did the rollback — check the connection, then schema_migrations.`;
    throw new Error(message, { cause: error });
  }
}

async function connect(url: string): Promise<pg.Client> {
  const client = createClient(url);
  const started = Date.now();

  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {});
    throw new Error(
      `Could not connect to ${describeTarget(url)} after ${elapsed(started)}.`,
      { cause: error },
    );
  }

  log('connected', `in ${elapsed(started)}`);

  const { rows } = await client.query<{
    version: string;
    database: string;
    user: string;
  }>(
    'select version(), current_database() as database, current_user as "user"',
  );
  const server = rows[0];
  if (server) {
    const release = server.version.split(' ').slice(0, 2).join(' ');
    log('server', `${release} — ${server.database} as ${server.user}`);
  }

  return client;
}

async function main(): Promise<void> {
  const started = Date.now();
  const { url, source } = resolveDatabaseTarget(process.argv.slice(2));

  log('target', `${describeTarget(url)} (from ${source})`);
  log('ssl', sslFor(url) ? 'on (rejectUnauthorized)' : 'off (loopback)');

  const client = await connect(url);

  try {
    const applied = await readApplied(client);
    const pending = pendingMigrations(await readMigrationFiles(), applied);

    log('state', `${applied.length} applied, ${pending.length} pending`);

    if (pending.length === 0) {
      log('done', `nothing to do (${elapsed(started)})`);
      return;
    }

    for (const { version, name } of pending) {
      log(DRY_RUN ? 'would' : 'pending', `${version}_${name}`);
    }

    if (DRY_RUN) {
      log('done', `dry run, nothing written (${elapsed(started)})`);
      return;
    }

    for (const migration of pending) {
      await apply(client, migration);
    }

    log('done', `${pending.length} applied in ${elapsed(started)}`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) {
    console.error(`  ${describeError(error.cause)}`);
  }
  process.exitCode = 1;
}
