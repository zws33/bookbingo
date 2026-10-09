import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';

export async function migrateUsers(
  firestore: Firestore,
  pgClient: pg.Client,
): Promise<number> {
  const snapshot = await firestore.collection('users').get();

  const users = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: (data.name as string | undefined)?.trim() || 'User',
      photoURL: (data.photoURL as string | null | undefined) ?? null,
      createdAt:
        (data.updatedAt as Timestamp | undefined)?.toDate() ?? new Date(),
    };
  });

  await pgClient.query('begin');
  await pgClient.query(
    `insert into users (id, name, photo_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])`,
    [
      users.map((u) => u.id),
      users.map((u) => u.name),
      users.map((u) => u.photoURL),
      users.map((u) => u.createdAt),
    ],
  );
  await pgClient.query('commit');

  return users.length;
}
