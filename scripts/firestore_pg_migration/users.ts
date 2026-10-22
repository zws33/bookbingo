import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { upsertCounts, type Counts } from './counts.js';

export async function migrateUsers(
  firestore: Firestore,
  pgClient: pg.Client,
): Promise<Counts> {
  const snapshot = await firestore.collection('users').get();

  const ids: string[] = [];
  const names: string[] = [];
  const photoUrls: (string | null)[] = [];
  const createdAts: Date[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    ids.push(doc.id);
    // `not null` with a default the named-column insert never fires.
    names.push((data.name as string | undefined)?.trim() || 'User');
    photoUrls.push((data.photoURL as string | null | undefined) ?? null);
    createdAts.push(
      (data.updatedAt as Timestamp | undefined)?.toDate() ?? new Date(),
    );
  }

  await pgClient.query('begin');
  // `created_at` is left to the first import: re-deriving it from `updatedAt`
  // would move it every time the profile changes.
  const result = await pgClient.query<{ inserted: boolean }>(
    `insert into users (id, name, photo_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])
         on conflict (id) do update
            set name = excluded.name,
                photo_url = excluded.photo_url,
                updated_at = now()
          where users.name is distinct from excluded.name
             or users.photo_url is distinct from excluded.photo_url
      returning (xmax = 0) as inserted`,
    [ids, names, photoUrls, createdAts],
  );
  await pgClient.query('commit');

  return upsertCounts(result, ids.length);
}
