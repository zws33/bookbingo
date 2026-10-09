import { randomUUID } from 'node:crypto';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { CHALLENGE_ID } from './constants.js';

export async function migrateTbrEntries(
  firestore: Firestore,
  pgClient: pg.Client,
  tagIdsByTile: Map<string, string>,
): Promise<number> {
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
    const id = randomUUID();

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

  await pgClient.query('begin');
  await pgClient.query(
    `insert into tbr_entries (id, challenge_id, user_id, book_id, notes, added_at, updated_at)
     select id, $1, user_id, book_id, notes, added_at, updated_at
       from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[])
         as t (id, user_id, book_id, notes, added_at, updated_at)`,
    [CHALLENGE_ID, ids, userIds, bookIds, notes, addedAts, updatedAts],
  );
  await pgClient.query(
    `insert into tbr_entry_tags (tbr_entry_id, tag_id, challenge_id)
     select tbr_entry_id, tag_id, $1
       from unnest($2::uuid[], $3::uuid[]) as t (tbr_entry_id, tag_id)`,
    [CHALLENGE_ID, tagEntryIds, tagIds],
  );
  await pgClient.query('commit');

  return ids.length;
}
