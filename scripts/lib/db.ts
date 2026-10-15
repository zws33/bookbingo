import pg from 'pg';

const { Client } = pg;

export type DatabaseTarget = { url: string; source: string };

const FLAG = '--database-url';

/**
 * DATABASE_URL is deliberately not consulted: it is the application's
 * connection, and a Neon URL in staging and prod. Defaulting to it once
 * silently migrated a remote database from a `test:db` run. Every script that
 * writes to Postgres resolves its target here, so the default is always the
 * local test database and a remote one is only ever reached by naming it.
 */
export function resolveDatabaseTarget(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): DatabaseTarget {
  const flagged = parseDatabaseUrlFlag(args);
  if (flagged !== undefined) {
    return assertUrl({ url: flagged, source: FLAG });
  }

  const stray = args.find(
    (arg) => arg.startsWith('postgres://') || arg.startsWith('postgresql://'),
  );
  if (stray) {
    throw new Error(
      `Pass the connection URL as ${FLAG} <url>, not as a bare argument.`,
    );
  }

  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      `No connection URL. Pass ${FLAG} <url> for a remote database, or set ` +
        'TEST_DATABASE_URL (functions/.env.local) for the local Docker Postgres.',
    );
  }
  return assertUrl({ url, source: 'TEST_DATABASE_URL' });
}

function parseDatabaseUrlFlag(args: readonly string[]): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${FLAG}=`));
  if (inline) {
    const value = inline.slice(FLAG.length + 1);
    if (!value) throw new Error(`${FLAG}= was given no value.`);
    return value;
  }

  const i = args.indexOf(FLAG);
  if (i === -1) return undefined;

  const value = args[i + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${FLAG} was given no value.`);
  }
  return value;
}

function assertUrl(target: DatabaseTarget): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(target.url);
  } catch {
    throw new Error(
      `The connection URL from ${target.source} is not a URL. Expected postgres://user:password@host:port/database.`,
    );
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `The connection URL from ${target.source} is ${parsed.protocol}//, not postgres:// or postgresql://.`,
    );
  }
  return target;
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
export function createClient(connectionString: string): pg.Client {
  return new Client({
    connectionString,
    ssl: sslFor(connectionString),
  });
}
