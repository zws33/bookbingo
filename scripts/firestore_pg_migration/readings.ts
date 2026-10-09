import { randomUUID } from 'node:crypto';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { CHALLENGE_ID } from './constants.js';

export async function migrateReadings(
  firestore: Firestore,
  pgClient: pg.Client,
  tagIdsByTile: Map<string, string>,
): Promise<number> {
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
    const id = randomUUID();

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

  await pgClient.query('begin');
  await pgClient.query(
    `insert into readings (id, challenge_id, user_id, book_id, is_freebie, read_at, created_at, updated_at)
     select id, $1, user_id, book_id, is_freebie, read_at, created_at, updated_at
       from unnest($2::uuid[], $3::text[], $4::text[], $5::boolean[], $6::timestamptz[], $7::timestamptz[], $8::timestamptz[])
         as t (id, user_id, book_id, is_freebie, read_at, created_at, updated_at)`,
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
  await pgClient.query(
    `insert into reading_tags (reading_id, tag_id, challenge_id)
     select reading_id, tag_id, $1
       from unnest($2::uuid[], $3::uuid[]) as t (reading_id, tag_id)`,
    [CHALLENGE_ID, tagReadingIds, tagIds],
  );
  await pgClient.query('commit');

  return ids.length;
}
