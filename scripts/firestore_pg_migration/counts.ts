import type pg from 'pg';

export interface Counts {
  inserted: number;
  updated: number;
  unchanged: number;
  deleted: number;
}

/**
 * Splits the rows an upsert returned into inserts and updates. `xmax` is zero
 * only on a freshly inserted row, so it distinguishes the two arms of `on
 * conflict do update`; a row the update's `where` clause skipped is returned by
 * neither arm, which is what makes the remainder the unchanged count.
 */
export function upsertCounts(
  result: pg.QueryResult<{ inserted: boolean }>,
  total: number,
  deleted = 0,
): Counts {
  const inserted = result.rows.filter((row) => row.inserted).length;
  return {
    inserted,
    updated: result.rows.length - inserted,
    unchanged: total - result.rows.length,
    deleted,
  };
}

export function insertCounts(
  inserted: number,
  total: number,
  deleted = 0,
): Counts {
  return { inserted, updated: 0, unchanged: total - inserted, deleted };
}

export function formatCounts(counts: Counts): string {
  const parts = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => `${value} ${label}`);
  return parts.length > 0 ? parts.join(', ') : 'no rows';
}
