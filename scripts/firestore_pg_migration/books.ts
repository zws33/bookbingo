import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';

interface BookMetadata {
  thumbnailUrl?: string | null;
}

/**
 * Documents written before `enrichedAt` was dropped hold `{ key, enrichedAt }`
 * where later ones hold a plain string.
 */
type ExternalIds =
  | { openLibrary?: string | { key: string } | null }
  | undefined;

function openLibraryKey(externalIds: ExternalIds): string | null {
  const value = externalIds?.openLibrary;
  if (!value) return null;
  return typeof value === 'string' ? value : value.key;
}

/**
 * `books.created_by` is omitted, not passed as null: Firestore's book
 * documents record no creator, so attribution starts empty rather than wrong.
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

  const refBookIds: string[] = [];
  const refExternalIds: string[] = [];

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

    // Absent for a manually entered book, which has no external catalog entry.
    const workKey = openLibraryKey(data.externalIds as ExternalIds);
    if (workKey) {
      refBookIds.push(doc.id);
      refExternalIds.push(workKey);
    }
  }

  await pgClient.query('begin');
  await pgClient.query(
    `insert into books (id, title, author, thumbnail_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
    [ids, titles, authors, thumbnailUrls, createdAts],
  );
  // `details` keeps its '{}' default: Firestore stores no provider payload.
  await pgClient.query(
    `insert into book_external_refs (book_id, source, external_id)
     select book_id, 'openLibrary', external_id
       from unnest($1::text[], $2::text[]) as t (book_id, external_id)`,
    [refBookIds, refExternalIds],
  );
  await pgClient.query('commit');

  return ids;
}
