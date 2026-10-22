import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { CHALLENGE_ID } from './constants.js';
import { importId } from './ids.js';
import { insertCounts, upsertCounts, type Counts } from './counts.js';

export async function migrateTbrEntries(
  firestore: Firestore,
  pgClient: pg.Client,
  tagIdsByTile: Map<string, string>,
  { prune }: { prune: boolean },
): Promise<{ entries: Counts; tags: Counts }> {
  const snapshot = await firestore.collectionGroup('tbr').get();

  const ids: string[] = [];
  const userIds: string[] = [];
  const bookIds: string[] = [];
  const notes: (string | null)[] = [];
  const addedAts: Date[] = [];
  const updatedAts: (Date | null)[] = [];

  const tagEntryIds: string[] = [];
  const tagIds: string[] = [];

  for (const doc of snapshot.docs) {
    const userId = doc.ref.parent.parent?.id;
    if (!userId) throw new Error(`${doc.ref.path} has no parent user`);

    const data = doc.data();
    const id = importId(doc.ref.path);

    ids.push(id);
    userIds.push(userId);
    bookIds.push(data.bookId as string);
    notes.push((data.notes as string | undefined) ?? null);
    addedAts.push((data.addedAt as Timestamp).toDate());
    updatedAts.push(
      (data.updatedAt as Timestamp | undefined)?.toDate() ?? null,
    );

    for (const tile of data.plannedTiles as string[]) {
      const tagId = tagIdsByTile.get(tile);
      if (!tagId) throw new Error(`${doc.ref.path} has unknown tile ${tile}`);
      tagEntryIds.push(id);
      tagIds.push(tagId);
    }
  }

  const pruning = prune && ids.length > 0;
  if (prune && ids.length === 0) {
    console.warn('tbr entries: source is empty, skipping prune');
  }

  await pgClient.query('begin');

  const prunedTags = await pgClient.query(
    `delete from tbr_entry_tags et
      where et.challenge_id = $1
        and case
              when et.tbr_entry_id = any($2::uuid[]) then
                not exists (
                  select 1
                    from unnest($3::uuid[], $4::uuid[]) as t (tbr_entry_id, tag_id)
                   where t.tbr_entry_id = et.tbr_entry_id
                     and t.tag_id = et.tag_id)
              else $5::boolean
            end`,
    [CHALLENGE_ID, ids, tagEntryIds, tagIds, pruning],
  );

  const prunedEntries = pruning
    ? await pgClient.query(
        'delete from tbr_entries where challenge_id = $1 and id <> all($2::uuid[])',
        [CHALLENGE_ID, ids],
      )
    : undefined;

  const entries = await pgClient.query<{ inserted: boolean }>(
    `insert into tbr_entries (id, challenge_id, user_id, book_id, notes, added_at, updated_at)
     select id, $1, user_id, book_id, notes, added_at, updated_at
       from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])
         as t (id, user_id, book_id, notes, added_at, updated_at)
         on conflict (id) do update
            set user_id = excluded.user_id,
                book_id = excluded.book_id,
                notes = excluded.notes,
                added_at = excluded.added_at,
                updated_at = excluded.updated_at
          where tbr_entries.user_id is distinct from excluded.user_id
             or tbr_entries.book_id is distinct from excluded.book_id
             or tbr_entries.notes is distinct from excluded.notes
             or tbr_entries.added_at is distinct from excluded.added_at
             or tbr_entries.updated_at is distinct from excluded.updated_at
      returning (xmax = 0) as inserted`,
    [CHALLENGE_ID, ids, userIds, bookIds, notes, addedAts, updatedAts],
  );

  const insertedTags = await pgClient.query(
    `insert into tbr_entry_tags (tbr_entry_id, tag_id, challenge_id)
     select tbr_entry_id, tag_id, $1
       from unnest($2::uuid[], $3::uuid[]) as t (tbr_entry_id, tag_id)
         on conflict (tbr_entry_id, tag_id) do nothing
      returning 1`,
    [CHALLENGE_ID, tagEntryIds, tagIds],
  );
  await pgClient.query('commit');

  return {
    entries: upsertCounts(entries, ids.length, prunedEntries?.rowCount ?? 0),
    tags: insertCounts(
      insertedTags.rowCount ?? 0,
      tagIds.length,
      prunedTags.rowCount ?? 0,
    ),
  };
}
