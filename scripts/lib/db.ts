import pg from 'pg';

const { Client } = pg;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Pass --env-file-if-exists=functions/.env.local, ' +
        'or export it for a remote database.',
    );
  }
  return url;
}

/**
 * A single session, not a pool: an open transaction belongs to one connection,
 * and a pool hands out whichever is free.
 */
export function createClient(): pg.Client {
  const connectionString = requireDatabaseUrl();
  const { hostname } = new URL(connectionString);
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

  return new Client({
    connectionString,
    ssl: isLoopback ? false : { rejectUnauthorized: true },
  });
}
