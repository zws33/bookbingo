import { DomainError } from '../common/errors.js';
import {
  MAX_READINGS_PER_USER,
  MAX_READINGS_SCAN,
  requireCompleteScan,
} from '../common/limits.js';
import { toDomainError, type ConstraintMessages } from '../common/pgErrors.js';
import { getPool } from '../db/pool.js';
import { inTransaction, type Db } from '../db/transaction.js';

/** A reading as stored: a book counted toward one challenge, with its tags. */
export interface Reading {
  id: string;
  userId: string;
  bookId: string;
  tagIds: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ReadingFields {
  bookId: string;
  tagIds: string[];
  isFreebie: boolean;
}

export interface ReadingRepository {
  list(challengeId: string, userId: string): Promise<Reading[]>;
  /** Keyed by user id, and only for members who are still `active` (rule 24). */
  listByChallenge(challengeId: string): Promise<Map<string, Reading[]>>;
  /**
   * The row an admin is about to edit. The Firestore path encoded authorship in
   * the document path; here the author is read so a guard can compare ranks.
   */
  get(challengeId: string, readingId: string): Promise<Reading | undefined>;
  create(
    challengeId: string,
    userId: string,
    fields: ReadingFields,
  ): Promise<string>;
  update(
    challengeId: string,
    readingId: string,
    fields: ReadingFields,
  ): Promise<void>;
  remove(challengeId: string, readingId: string): Promise<void>;
}

interface ReadingRow {
  id: string;
  user_id: string;
  book_id: string;
  tag_ids: string[];
  is_freebie: boolean;
  read_at: Date;
  created_at: Date;
  updated_at: Date | null;
}

function toReading(row: ReadingRow): Reading {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    tagIds: row.tag_ids,
    isFreebie: row.is_freebie,
    readAt: row.read_at,
    createdAt: row.created_at,
    ...(row.updated_at !== null && { updatedAt: row.updated_at }),
  };
}

/**
 * `filter` keeps a reading with no tags, which a left join would otherwise give
 * a single null element.
 */
const SELECT_READINGS = `
  select r.id, r.user_id, r.book_id, r.is_freebie, r.read_at, r.created_at, r.updated_at,
         coalesce(
           array_agg(rt.tag_id::text order by rt.tag_id) filter (where rt.tag_id is not null),
           '{}'
         ) as tag_ids
    from readings r
    left join reading_tags rt on rt.reading_id = r.id`;

const GONE = 'That reading no longer exists.';

const WRITE_ERRORS: ConstraintMessages = {
  readings_book_id_fkey: ['not-found', 'That book is not in the catalog.'],
  readings_challenge_id_user_id_fkey: [
    'not-found',
    'You are not a member of that challenge.',
  ],
  readings_one_freebie_idx: [
    'conflict',
    'You already have a freebie reading in this challenge.',
  ],
  reading_tags_tag_id_challenge_id_fkey: [
    'invalid-input',
    'That tag is not part of this challenge.',
  ],
};

async function replaceTags(
  client: Db,
  readingId: string,
  challengeId: string,
  tagIds: string[],
): Promise<void> {
  await client.query(
    'delete from reading_tags where reading_id = $1 and challenge_id = $2',
    [readingId, challengeId],
  );

  for (const tagId of tagIds) {
    await client.query(
      `insert into reading_tags (reading_id, tag_id, challenge_id)
       values ($1, $2, $3)`,
      [readingId, tagId, challengeId],
    );
  }
}

export function readingRepository(db: Db = getPool()): ReadingRepository {
  const rules = { constraints: WRITE_ERRORS, malformedId: GONE };

  /** A malformed challenge or reading id names no row, which reads as an empty result. */
  async function readRows(
    sql: string,
    values: readonly unknown[],
  ): Promise<ReadingRow[]> {
    try {
      const { rows } = await db.query<ReadingRow>(sql, values);
      return rows;
    } catch (error) {
      const mapped = toDomainError(error, rules);
      if (mapped instanceof DomainError && mapped.kind === 'not-found') {
        return [];
      }
      throw mapped;
    }
  }

  return {
    async list(challengeId, userId) {
      const rows = await readRows(
        `${SELECT_READINGS}
          where r.challenge_id = $1 and r.user_id = $2
          group by r.id
          order by r.read_at desc, r.id
          limit $3`,
        [challengeId, userId, MAX_READINGS_PER_USER],
      );
      return rows.map(toReading);
    },

    async listByChallenge(challengeId) {
      const rows = await readRows(
        `${SELECT_READINGS}
           join memberships m
             on m.challenge_id = r.challenge_id
            and m.user_id = r.user_id
            and m.status = 'active'
          where r.challenge_id = $1
          group by r.id
          order by r.read_at desc, r.id
          limit $2`,
        [challengeId, MAX_READINGS_SCAN + 1],
      );
      requireCompleteScan('readings', rows, MAX_READINGS_SCAN);

      const byUser = new Map<string, Reading[]>();
      for (const row of rows) {
        const existing = byUser.get(row.user_id);
        if (existing) existing.push(toReading(row));
        else byUser.set(row.user_id, [toReading(row)]);
      }
      return byUser;
    },

    async get(challengeId, readingId) {
      const rows = await readRows(
        `${SELECT_READINGS}
          where r.challenge_id = $1 and r.id = $2
          group by r.id`,
        [challengeId, readingId],
      );
      const row = rows[0];
      return row ? toReading(row) : undefined;
    },

    async create(challengeId, userId, { bookId, tagIds, isFreebie }) {
      try {
        return await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ id: string }>(
            `insert into readings (challenge_id, user_id, book_id, is_freebie)
             values ($1, $2, $3, $4) returning id`,
            [challengeId, userId, bookId, isFreebie],
          );
          const readingId = rows[0]?.id;
          if (!readingId) {
            throw new Error('insert into readings returned no id');
          }

          await replaceTags(client, readingId, challengeId, tagIds);
          return readingId;
        });
      } catch (error) {
        // No reading exists yet, so a malformed id can only be the challenge's.
        throw toDomainError(error, {
          ...rules,
          malformedId: 'You are not a member of that challenge.',
        });
      }
    },

    async update(challengeId, readingId, { bookId, tagIds, isFreebie }) {
      try {
        await inTransaction(db, async (client) => {
          const { rowCount } = await client.query(
            `update readings
                set book_id = $3, is_freebie = $4, updated_at = now()
              where challenge_id = $1 and id = $2`,
            [challengeId, readingId, bookId, isFreebie],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);

          await replaceTags(client, readingId, challengeId, tagIds);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    /**
     * `reading_tags` references the reading with `restrict`, so its rows go
     * first and by name. A cross-challenge call is undone by the `not-found`
     * rollback; scoping both statements on `challengeId` keeps each correct on
     * its own.
     */
    async remove(challengeId, readingId) {
      try {
        await inTransaction(db, async (client) => {
          await client.query(
            'delete from reading_tags where reading_id = $2 and challenge_id = $1',
            [challengeId, readingId],
          );

          const { rowCount } = await client.query(
            'delete from readings where challenge_id = $1 and id = $2',
            [challengeId, readingId],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },
  };
}
