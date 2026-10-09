import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';

interface BookMetadata {
  thumbnailUrl?: string | null;
}

/**
 * `created_by` is omitted, not passed as null: Firestore's book documents
 * record no creator, so attribution starts empty rather than wrong.
 *
 * The other five `metadata` fields (pageCount, publishedDate, categories,
 * language, isbn) have no columns in 0002_books.sql and are dropped.
 */
export async function migrateBooks(
  firestore: Firestore,
  pgClient: pg.Client,
): Promise<string[]> {
  const snapshot = await firestore.collection('books').get();

  const ids: string[] = [];
  const titles: string[] = [];
  const authors: string[] = [];
  const thumbnailUrls: (string | null)[] = [];
  const createdAts: Date[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const metadata = data.metadata as BookMetadata | undefined;

    ids.push(doc.id);
    titles.push(data.title as string);
    authors.push(data.author as string);
    // `||` rather than `??`: legacy documents hold an empty string.
    thumbnailUrls.push(metadata?.thumbnailUrl || null);
    createdAts.push(
      (data.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
    );
  }

  await pgClient.query('begin');
  await pgClient.query(
    `insert into books (id, title, author, thumbnail_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
    [ids, titles, authors, thumbnailUrls, createdAts],
  );
  await pgClient.query('commit');

  return ids;
}
