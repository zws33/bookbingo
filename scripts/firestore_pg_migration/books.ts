import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type pg from 'pg';
import { insertCounts, upsertCounts, type Counts } from './counts.js';

interface BookMetadata {
  thumbnailUrl?: string | null;
}

// Older documents hold `{ key, enrichedAt }` where later ones hold a string.
type ExternalIds =
  | { openLibrary?: string | { key: string } | null }
  | undefined;

function openLibraryKey(externalIds: ExternalIds): string | null {
  const value = externalIds?.openLibrary;
  if (!value) return null;
  return typeof value === 'string' ? value : value.key;
}

// `created_by` is omitted: Firestore records no book creator.
export async function migrateBooks(
  firestore: Firestore,
  pgClient: pg.Client,
  { prune }: { prune: boolean },
): Promise<{ books: Counts; refs: Counts }> {
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

    const workKey = openLibraryKey(data.externalIds as ExternalIds);
    if (workKey) {
      refBookIds.push(doc.id);
      refExternalIds.push(workKey);
    }
  }

  await pgClient.query('begin');
  // `created_by` and `created_at` stay out of the update: a book entered by
  // hand in Postgres keeps its creator, which Firestore cannot supply.
  const books = await pgClient.query<{ inserted: boolean }>(
    `insert into books (id, title, author, thumbnail_url, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
         on conflict (id) do update
            set title = excluded.title,
                author = excluded.author,
                thumbnail_url = excluded.thumbnail_url
          where books.title is distinct from excluded.title
             or books.author is distinct from excluded.author
             or books.thumbnail_url is distinct from excluded.thumbnail_url
      returning (xmax = 0) as inserted`,
    [ids, titles, authors, thumbnailUrls, createdAts],
  );

  // Scoped to the books this snapshot carries, so a ref for a book that only
  // exists in Postgres survives. Catches a work key that changed as well as one
  // that was removed.
  const prunedRefs = prune
    ? await pgClient.query(
        `delete from book_external_refs r
          where r.source = 'openLibrary'
            and r.book_id = any($1::text[])
            and not exists (
                  select 1
                    from unnest($2::text[], $3::text[]) as t (book_id, external_id)
                   where t.book_id = r.book_id
                     and t.external_id = r.external_id)`,
        [ids, refBookIds, refExternalIds],
      )
    : undefined;

  // Untargeted `do nothing`: the row collides on its primary key when unchanged
  // and on `unique (source, external_id)` when two books claim one work key.
  const refs = await pgClient.query(
    `insert into book_external_refs (book_id, source, external_id)
     select book_id, 'openLibrary', external_id
       from unnest($1::text[], $2::text[]) as t (book_id, external_id)
         on conflict do nothing
      returning 1`,
    [refBookIds, refExternalIds],
  );
  await pgClient.query('commit');

  return {
    books: upsertCounts(books, ids.length),
    refs: insertCounts(
      refs.rowCount ?? 0,
      refBookIds.length,
      prunedRefs?.rowCount ?? 0,
    ),
  };
}
