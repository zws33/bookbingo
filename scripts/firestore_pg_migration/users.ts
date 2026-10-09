import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';

export async function migrateUsers(
  firestore: Firestore,
  pgClient: pg.Client,
): Promise<number> {
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
  await pgClient.query(
    `insert into users (id, name, photo_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])`,
    [ids, names, photoUrls, createdAts],
  );
  await pgClient.query('commit');

  return ids.length;
}
