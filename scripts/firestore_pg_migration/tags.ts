import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TILES } from '../../functions/src/domain/constants.js';
import { CHALLENGE_ID } from './constants.js';
import { insertCounts, type Counts } from './counts.js';

/**
 * Resolves the tile-to-tag mapping from the labels already stored rather than
 * from the ids generated here, so a rerun reuses the tag rows that readings and
 * TBR entries are attached to. Tags are never deleted: `reading_tags` restricts
 * it, and a label dropped from `TILES` still carries scoring history.
 */
export async function migrateTags(
  pgClient: pg.Client,
): Promise<{ tagIdsByTile: Map<string, string>; counts: Counts }> {
  const ids: string[] = [];
  const labels: string[] = [];

  for (const tile of TILES) {
    ids.push(randomUUID());
    labels.push(tile.name);
  }

  await pgClient.query('begin');
  const inserted = await pgClient.query(
    `insert into tags (id, challenge_id, label)
     select id, $1, label from unnest($2::uuid[], $3::text[]) as t (id, label)
         on conflict (challenge_id, lower(label)) do nothing
      returning 1`,
    [CHALLENGE_ID, ids, labels],
  );

  const stored = await pgClient.query<{ id: string; label: string }>(
    'select id, label from tags where challenge_id = $1',
    [CHALLENGE_ID],
  );
  await pgClient.query('commit');

  const idsByLabel = new Map(
    stored.rows.map((row) => [row.label.toLowerCase(), row.id]),
  );

  const tagIdsByTile = new Map<string, string>();
  for (const tile of TILES) {
    const id = idsByLabel.get(tile.name.toLowerCase());
    if (!id)
      throw new Error(`tile ${tile.id} has no tag row for "${tile.name}"`);
    tagIdsByTile.set(tile.id, id);
  }

  return {
    tagIdsByTile,
    counts: insertCounts(inserted.rowCount ?? 0, TILES.length),
  };
}
