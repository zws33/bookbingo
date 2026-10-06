import type pg from 'pg';

/**
 * A pool or a client inside an open transaction. Repositories take one so a
 * cross-aggregate write composes under a single transaction without a Unit of
 * Work, and a single-statement call still runs straight off the pool.
 */
export interface Db {
  query<R extends pg.QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
}

/**
 * A pool hands out connections; a client is already one. The probe is `release`
 * rather than `connect`, because a `PoolClient` has both — probing `connect`
 * calls it on a connected client and fails with "cannot reuse a client".
 */
function asPool(db: Db): pg.Pool | undefined {
  const candidate = db as Partial<pg.PoolClient & pg.Pool>;
  if (typeof candidate.release === 'function') return undefined;
  return typeof candidate.connect === 'function' ? (db as pg.Pool) : undefined;
}

/**
 * Runs `work` inside a transaction, joining the caller's when there already is
 * one. A multi-statement repository method wraps itself in this, so it is
 * atomic called on its own and still one transaction when composed — without
 * it, `createIfAbsent` off the pool could leave a book with no external refs.
 *
 * The callback's own error is the one worth reading, so a failed rollback is
 * swallowed: it would replace a constraint violation with a connection error.
 */
export async function inTransaction<T>(
  db: Db,
  work: (client: Db) => Promise<T>,
): Promise<T> {
  const pool = asPool(db);
  if (!pool) return work(db);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* the original error is thrown below */
    }
    throw error;
  } finally {
    client.release();
  }
}
