import { randomBytes } from 'node:crypto';
import type { Db } from '../db/transaction.js';

/**
 * Raw inserts, never the repository under test: a fixture built on the code it
 * sets up for cannot fail independently of it.
 */
let sequence = 0;
const unique = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export async function seedUser(
  db: Db,
  { id = unique('user'), name = 'Reader' }: { id?: string; name?: string } = {},
): Promise<string> {
  await db.query('insert into users (id, name) values ($1, $2)', [id, name]);
  return id;
}

export async function seedBook(
  db: Db,
  {
    id = randomBytes(16).toString('hex'),
    title = 'A Book',
    author = 'An Author',
    thumbnailUrl = null,
    createdBy = null,
  }: {
    id?: string;
    title?: string;
    author?: string;
    thumbnailUrl?: string | null;
    createdBy?: string | null;
  } = {},
): Promise<string> {
  await db.query(
    `insert into books (id, title, author, thumbnail_url, created_by)
     values ($1, $2, $3, $4, $5)`,
    [id, title, author, thumbnailUrl, createdBy],
  );
  return id;
}

export async function seedChallenge(
  db: Db,
  {
    createdBy,
    name = unique('Challenge'),
    tagCap = 3,
    status = 'draft',
  }: {
    createdBy: string;
    name?: string;
    tagCap?: number;
    status?: 'draft' | 'active' | 'complete';
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into challenges (name, tag_cap, status, created_by)
     values ($1, $2, $3, $4) returning id`,
    [name, tagCap, status, createdBy],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into challenges returned no id');
  return id;
}

export async function seedMembership(
  db: Db,
  {
    challengeId,
    userId,
    role = 'member',
    status = 'active',
  }: {
    challengeId: string;
    userId: string;
    role?: 'member' | 'admin' | 'owner';
    status?: 'active' | 'left' | 'removed';
  },
): Promise<void> {
  await db.query(
    `insert into memberships (challenge_id, user_id, role, status)
     values ($1, $2, $3, $4)`,
    [challengeId, userId, role, status],
  );
}

export async function seedTag(
  db: Db,
  {
    challengeId,
    label = unique('Tag'),
  }: { challengeId: string; label?: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into tags (challenge_id, label) values ($1, $2) returning id',
    [challengeId, label],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into tags returned no id');
  return id;
}

export async function seedReading(
  db: Db,
  {
    challengeId,
    userId,
    bookId,
    isFreebie = false,
    readAt,
  }: {
    challengeId: string;
    userId: string;
    bookId: string;
    isFreebie?: boolean;
    readAt?: Date;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into readings (challenge_id, user_id, book_id, is_freebie, read_at)
     values ($1, $2, $3, $4, coalesce($5, now())) returning id`,
    [challengeId, userId, bookId, isFreebie, readAt ?? null],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into readings returned no id');
  return id;
}

export async function seedReadingTag(
  db: Db,
  {
    readingId,
    tagId,
    challengeId,
  }: { readingId: string; tagId: string; challengeId: string },
): Promise<void> {
  await db.query(
    `insert into reading_tags (reading_id, tag_id, challenge_id)
     values ($1, $2, $3)`,
    [readingId, tagId, challengeId],
  );
}

export async function seedTbrEntry(
  db: Db,
  {
    challengeId,
    userId,
    bookId,
    notes = null,
    addedAt,
  }: {
    challengeId: string;
    userId: string;
    bookId: string;
    notes?: string | null;
    addedAt?: Date;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into tbr_entries (challenge_id, user_id, book_id, notes, added_at)
     values ($1, $2, $3, $4, coalesce($5, now())) returning id`,
    [challengeId, userId, bookId, notes, addedAt ?? null],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('insert into tbr_entries returned no id');
  return id;
}

export async function seedTbrEntryTag(
  db: Db,
  {
    tbrEntryId,
    tagId,
    challengeId,
  }: { tbrEntryId: string; tagId: string; challengeId: string },
): Promise<void> {
  await db.query(
    `insert into tbr_entry_tags (tbr_entry_id, tag_id, challenge_id)
     values ($1, $2, $3)`,
    [tbrEntryId, tagId, challengeId],
  );
}
