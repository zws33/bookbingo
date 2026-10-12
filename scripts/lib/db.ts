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

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function sslFor(url: string): pg.ClientConfig['ssl'] {
  return isLoopback(new URL(url).hostname)
    ? false
    : { rejectUnauthorized: true };
}

/**
 * `host:port/database as user`. Never the password: this string is logged, and
 * a Neon URL carries its credential inline.
 */
export function describeTarget(url: string): string {
  const { hostname, port, pathname, username } = new URL(url);
  const host = port ? `${hostname}:${port}` : hostname;
  const database = pathname.replace(/^\//, '') || '(default)';
  return `${host}/${database}${username ? ` as ${username}` : ''}`;
}

/**
 * A single session, not a pool: an open transaction belongs to one connection,
 * and a pool hands out whichever is free.
 */
export function createClient(): pg.Client {
  const connectionString = requireDatabaseUrl();

  return new Client({
    connectionString,
    ssl: sslFor(connectionString),
  });
}
