import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { CHALLENGE_ID } from './constants.js';
import { importId } from './ids.js';
import { insertCounts, upsertCounts, type Counts } from './counts.js';

/**
 * Without the prune, a row the previous import keyed differently stays behind
 * and the replacement lands beside it — which `readings_one_freebie_idx` then
 * rejects, because a member gets one freebie. Said upfront so that constraint
 * violation is readable when it arrives.
 */
async function warnAboutOrphans(
  pgClient: pg.Client,
  ids: readonly string[],
): Promise<void> {
  const { rows } = await pgClient.query<{ count: string }>(
    `select count(*) as count from readings
      where challenge_id = $1 and id <> all($2::uuid[])`,
    [CHALLENGE_ID, ids],
  );
  const orphans = Number(rows[0]?.count ?? 0);
  if (orphans === 0) return;

  console.warn(
    `readings: ${orphans} row(s) have no Firestore document and --no-prune ` +
      'leaves them in place. If one is a freebie the upsert will fail on ' +
      'readings_one_freebie_idx; rerun without --no-prune to replace them.',
  );
}

export async function migrateReadings(
  firestore: Firestore,
  pgClient: pg.Client,
  tagIdsByTile: Map<string, string>,
  { prune }: { prune: boolean },
): Promise<{ readings: Counts; tags: Counts }> {
  const snapshot = await firestore.collectionGroup('readings').get();

  const ids: string[] = [];
  const userIds: string[] = [];
  const bookIds: string[] = [];
  const isFreebies: boolean[] = [];
  const readAts: Date[] = [];
  const createdAts: Date[] = [];
  const updatedAts: (Date | null)[] = [];

  const tagReadingIds: string[] = [];
  const tagIds: string[] = [];

  for (const doc of snapshot.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) throw new Error(`${doc.ref.path} has no parent user`);

    const data = doc.data();
    const id = importId(doc.ref.path);

    ids.push(id);
    userIds.push(userId);
    bookIds.push(data.bookId as string);
    isFreebies.push(data.isFreebie as boolean);
    readAts.push((data.readAt as Timestamp).toDate());
    createdAts.push((data.createdAt as Timestamp).toDate());
    updatedAts.push(
      (data.updatedAt as Timestamp | undefined)?.toDate() ?? null,
    );

    for (const tile of data.tiles as string[]) {
      const tagId = tagIdsByTile.get(tile);
      if (!tagId) throw new Error(`${doc.ref.path} has unknown tile ${tile}`);
      tagReadingIds.push(id);
      tagIds.push(tagId);
    }
  }

  // An empty collection group is far more likely to be a failed read than an
  // emptied challenge, and pruning on it would delete every reading.
  const pruning = prune && ids.length > 0;
  if (prune && ids.length === 0) {
    console.warn('readings: source is empty, skipping prune');
  }

  await pgClient.query('begin');

  if (!pruning) await warnAboutOrphans(pgClient, ids);

  // Before the readings themselves: `reading_tags` restricts their delete. The
  // `case` drops stale pairs from a reading Firestore still has, and every pair
  // from one it no longer has.
  const prunedTags = await pgClient.query(
    `delete from reading_tags rt
      where rt.challenge_id = $1
        and case
              when rt.reading_id = any($2::uuid[]) then
                not exists (
                  select 1
                    from unnest($3::uuid[], $4::uuid[]) as t (reading_id, tag_id)
                   where t.reading_id = rt.reading_id
                     and t.tag_id = rt.tag_id)
              else $5::boolean
            end`,
    [CHALLENGE_ID, ids, tagReadingIds, tagIds, pruning],
  );

  // Ahead of the upsert, not after it: `readings_one_freebie_idx` allows one
  // freebie per member, so a re-keyed freebie collides with the row it replaces.
  const prunedReadings = pruning
    ? await pgClient.query(
        'delete from readings where challenge_id = $1 and id <> all($2::uuid[])',
        [CHALLENGE_ID, ids],
      )
    : undefined;

  const readings = await pgClient.query<{ inserted: boolean }>(
    `insert into readings (id, challenge_id, user_id, book_id, is_freebie, read_at, created_at, updated_at)
     select id, $1, user_id, book_id, is_freebie, read_at, created_at, updated_at
       from unnest($2::uuid[], $3::text[], $4::text[], $5::boolean[], $6::timestamptz[], $7::timestamptz[], $8::timestamptz[])
         as t (id, user_id, book_id, is_freebie, read_at, created_at, updated_at)
         on conflict (id) do update
            set user_id = excluded.user_id,
                book_id = excluded.book_id,
                is_freebie = excluded.is_freebie,
                read_at = excluded.read_at,
                updated_at = excluded.updated_at
          where readings.user_id is distinct from excluded.user_id
             or readings.book_id is distinct from excluded.book_id
             or readings.is_freebie is distinct from excluded.is_freebie
             or readings.read_at is distinct from excluded.read_at
             or readings.updated_at is distinct from excluded.updated_at
      returning (xmax = 0) as inserted`,
    [
      CHALLENGE_ID,
      ids,
      userIds,
      bookIds,
      isFreebies,
      readAts,
      createdAts,
      updatedAts,
    ],
  );

  const insertedTags = await pgClient.query(
    `insert into reading_tags (reading_id, tag_id, challenge_id)
     select reading_id, tag_id, $1
       from unnest($2::uuid[], $3::uuid[]) as t (reading_id, tag_id)
         on conflict (reading_id, tag_id) do nothing
      returning 1`,
    [CHALLENGE_ID, tagReadingIds, tagIds],
  );
  await pgClient.query('commit');

  return {
    readings: upsertCounts(readings, ids.length, prunedReadings?.rowCount ?? 0),
    tags: insertCounts(
      insertedTags.rowCount ?? 0,
      tagIds.length,
      prunedTags.rowCount ?? 0,
    ),
  };
}
