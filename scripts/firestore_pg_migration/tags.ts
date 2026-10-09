import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TILES } from '../../functions/src/domain/constants.js';
import { CHALLENGE_ID } from './constants.js';

export async function migrateTags(
  pgClient: pg.Client,
): Promise<Map<string, string>> {
  const tagIdsByTile = new Map<string, string>();
  const ids: string[] = [];
  const labels: string[] = [];

  for (const tile of TILES) {
    const id = randomUUID();
    tagIdsByTile.set(tile.id, id);
    ids.push(id);
    labels.push(tile.name);
  }

  await pgClient.query('begin');
  await pgClient.query(
    `insert into tags (id, challenge_id, label)
     select id, $1, label from unnest($2::uuid[], $3::text[]) as t (id, label)`,
    [CHALLENGE_ID, ids, labels],
  );
  await pgClient.query('commit');

  return tagIdsByTile;
}
