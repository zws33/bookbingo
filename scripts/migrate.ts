/**
 * Applies `db/migrations/*.sql` to DATABASE_URL, in order, once each.
 *
 * Usage:
 *   pnpm run db:migrate
 *   pnpm run db:migrate -- --dry-run
 */

import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';
import { createClient } from './lib/db.js';
import {
  checksumOf,
  parseMigrationFilename,
  pendingMigrations,
  type AppliedMigration,
  type MigrationFile,
} from './lib/migrations.js';

const MIGRATIONS_DIR = new URL('../db/migrations/', import.meta.url);

const DRY_RUN = process.argv.includes('--dry-run');

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

  await client.query('begin');
  try {
    await client.query(migration.sql);
    await client.query(
      'insert into schema_migrations (version, name, checksum) values ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum],
    );
    await client.query('commit');
  } catch (error) {
    const message = (await rollback(client))
      ? `Migration ${label} failed and was rolled back.`
      : `Migration ${label} failed, and so did the rollback — check the connection, then schema_migrations.`;
    throw new Error(message, { cause: error });
  }
}

async function main(): Promise<void> {
  const client = createClient();
  await client.connect();

  try {
    const pending = pendingMigrations(
      await readMigrationFiles(),
      await readApplied(client),
    );

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    if (DRY_RUN) {
      console.log(`${pending.length} pending:`);
      for (const { version, name } of pending) {
        console.log(`  ${version}_${name}`);
      }
      return;
    }

    for (const migration of pending) {
      await apply(client, migration);
      console.log(`applied ${migration.version}_${migration.name}`);
    }
    console.log(`${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof Error && error.cause) console.error(error.cause);
  process.exitCode = 1;
}
