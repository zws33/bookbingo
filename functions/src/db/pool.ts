import pg from 'pg';
import { logFailure } from '../observability.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

const MAX_CONNECTIONS_PER_INSTANCE = 2;

function requireConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Locally: node --env-file=functions/.env.local. ' +
        'Deployed: bind the DATABASE_URL secret to the function.',
    );
  }
  return url;
}

function sslFor(url: string): pg.PoolConfig['ssl'] {
  const { hostname } = new URL(url);
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
  return isLoopback ? false : { rejectUnauthorized: true };
}

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = requireConnectionString();
  pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: MAX_CONNECTIONS_PER_INSTANCE,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (error) => {
    logFailure('db.pool.error', error);
  });

  return pool;
}

/** Tests and scripts only; a function instance is frozen, never shut down. */
export async function closePool(): Promise<void> {
  const open = pool;
  pool = undefined;
  await open?.end();
}
