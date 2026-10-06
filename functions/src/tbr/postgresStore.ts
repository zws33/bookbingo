import { DomainError } from '../common/errors.js';
import { MAX_TBR_PER_USER } from '../common/limits.js';
import { toDomainError, type ConstraintMessages } from '../common/pgErrors.js';
import { getPool } from '../db/pool.js';
import { inTransaction, type Db } from '../db/transaction.js';

export interface TBREntry {
  id: string;
  userId: string;
  bookId: string;
  plannedTagIds: string[];
  notes?: string;
  addedAt: Date;
  updatedAt?: Date;
}

export interface TBREntryFields {
  bookId: string;
  plannedTagIds: string[];
  /** Explicit undefined is allowed: the parsed request omits it as undefined. */
  notes?: string | undefined;
}

export interface PromotionRequest {
  challengeId: string;
  userId: string;
  tbrId: string;
  tagIds: string[];
  isFreebie: boolean;
}

export interface PromotionOutcome {
  readingId: string;
  bookId: string;
  /** The entry was already promoted by an earlier call whose response was lost. */
  alreadyLogged: boolean;
}

export interface TBREntryRepository {
  list(challengeId: string, userId: string): Promise<TBREntry[]>;
  get(challengeId: string, tbrId: string): Promise<TBREntry | undefined>;
  create(
    challengeId: string,
    userId: string,
    fields: TBREntryFields,
  ): Promise<string>;
  update(
    challengeId: string,
    tbrId: string,
    fields: Omit<TBREntryFields, 'bookId'>,
  ): Promise<void>;
  remove(challengeId: string, tbrId: string): Promise<void>;
  promote(request: PromotionRequest): Promise<PromotionOutcome>;
}

interface TBREntryRow {
  id: string;
  user_id: string;
  book_id: string;
  tag_ids: string[];
  notes: string | null;
  added_at: Date;
  updated_at: Date | null;
}

function toTBREntry(row: TBREntryRow): TBREntry {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    plannedTagIds: row.tag_ids,
    ...(row.notes !== null && { notes: row.notes }),
    addedAt: row.added_at,
    ...(row.updated_at !== null && { updatedAt: row.updated_at }),
  };
}

const SELECT_ENTRIES = `
  select e.id, e.user_id, e.book_id, e.notes, e.added_at, e.updated_at,
         coalesce(
           array_agg(t.tag_id::text order by t.tag_id) filter (where t.tag_id is not null),
           '{}'
         ) as tag_ids
    from tbr_entries e
    left join tbr_entry_tags t on t.tbr_entry_id = e.id`;

const GONE = 'That entry no longer exists.';

const WRITE_ERRORS: ConstraintMessages = {
  tbr_entries_book_id_fkey: ['not-found', 'That book is not in the catalog.'],
  tbr_entries_challenge_id_user_id_fkey: [
    'not-found',
    'You are not a member of that challenge.',
  ],
  tbr_entries_notes_check: [
    'invalid-input',
    'Notes must be 2000 characters or fewer.',
  ],
  tbr_entry_tags_tag_id_challenge_id_fkey: [
    'invalid-input',
    'That tag is not part of this challenge.',
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

/**
 * `tbr_entry_tags` references the entry with `restrict`, so every path that
 * drops or rewrites an entry's planned tags calls this first.
 */
async function deletePlannedTags(
  client: Db,
  tbrId: string,
  challengeId: string,
): Promise<void> {
  await client.query(
    'delete from tbr_entry_tags where tbr_entry_id = $1 and challenge_id = $2',
    [tbrId, challengeId],
  );
}

async function replacePlannedTags(
  client: Db,
  tbrId: string,
  challengeId: string,
  tagIds: string[],
): Promise<void> {
  await deletePlannedTags(client, tbrId, challengeId);

  for (const tagId of tagIds) {
    await client.query(
      `insert into tbr_entry_tags (tbr_entry_id, tag_id, challenge_id)
       values ($1, $2, $3)`,
      [tbrId, tagId, challengeId],
    );
  }
}

export function tbrEntryRepository(db: Db = getPool()): TBREntryRepository {
  const rules = { constraints: WRITE_ERRORS, malformedId: GONE };

  async function readRows(
    sql: string,
    values: readonly unknown[],
  ): Promise<TBREntryRow[]> {
    try {
      const { rows } = await db.query<TBREntryRow>(sql, values);
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
        `${SELECT_ENTRIES}
          where e.challenge_id = $1 and e.user_id = $2
          group by e.id
          order by e.added_at desc, e.id
          limit $3`,
        [challengeId, userId, MAX_TBR_PER_USER],
      );
      return rows.map(toTBREntry);
    },

    async get(challengeId, tbrId) {
      const rows = await readRows(
        `${SELECT_ENTRIES}
          where e.challenge_id = $1 and e.id = $2
          group by e.id`,
        [challengeId, tbrId],
      );
      const row = rows[0];
      return row ? toTBREntry(row) : undefined;
    },

    async create(challengeId, userId, { bookId, plannedTagIds, notes }) {
      try {
        return await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ id: string }>(
            `insert into tbr_entries (challenge_id, user_id, book_id, notes)
             values ($1, $2, $3, $4) returning id`,
            [challengeId, userId, bookId, notes ?? null],
          );
          const tbrId = rows[0]?.id;
          if (!tbrId) {
            throw new Error('insert into tbr_entries returned no id');
          }

          await replacePlannedTags(client, tbrId, challengeId, plannedTagIds);
          return tbrId;
        });
      } catch (error) {
        // No entry exists yet, so a malformed id can only be the challenge's.
        throw toDomainError(error, {
          ...rules,
          malformedId: 'You are not a member of that challenge.',
        });
      }
    },

    async update(challengeId, tbrId, { plannedTagIds, notes }) {
      try {
        await inTransaction(db, async (client) => {
          const { rowCount } = await client.query(
            `update tbr_entries
                set notes = $3, updated_at = now()
              where challenge_id = $1 and id = $2`,
            [challengeId, tbrId, notes ?? null],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);

          await replacePlannedTags(client, tbrId, challengeId, plannedTagIds);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    /**
     * The planned tag rows go first and by name. A cross-challenge call is
     * undone by the `not-found` rollback; both statements carry `challengeId`
     * so neither is wrong on its own.
     */
    async remove(challengeId, tbrId) {
      try {
        await inTransaction(db, async (client) => {
          await deletePlannedTags(client, tbrId, challengeId);

          const { rowCount } = await client.query(
            'delete from tbr_entries where challenge_id = $1 and id = $2',
            [challengeId, tbrId],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    async promote({ challengeId, userId, tbrId, tagIds, isFreebie }) {
      try {
        return await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ book_id: string }>(
            `select book_id from tbr_entries
              where challenge_id = $1 and user_id = $2 and id = $3
              for update`,
            [challengeId, userId, tbrId],
          );

          const entry = rows[0];
          if (!entry) {
            const logged = await client.query<{ book_id: string }>(
              `select book_id from readings
                where challenge_id = $1 and user_id = $2 and id = $3`,
              [challengeId, userId, tbrId],
            );
            const reading = logged.rows[0];
            if (!reading) throw new DomainError('not-found', GONE);
            return {
              readingId: tbrId,
              bookId: reading.book_id,
              alreadyLogged: true,
            };
          }

          await client.query(
            `insert into readings (id, challenge_id, user_id, book_id, is_freebie)
             values ($1, $2, $3, $4, $5)`,
            [tbrId, challengeId, userId, entry.book_id, isFreebie],
          );

          for (const tagId of tagIds) {
            await client.query(
              `insert into reading_tags (reading_id, tag_id, challenge_id)
               values ($1, $2, $3)`,
              [tbrId, tagId, challengeId],
            );
          }

          // The reading's tags are new rows in `reading_tags`; the entry still
          // holds its own planned tags, which `restrict` keeps it alive for.
          await deletePlannedTags(client, tbrId, challengeId);

          await client.query(
            `delete from tbr_entries
              where challenge_id = $1 and user_id = $2 and id = $3`,
            [challengeId, userId, tbrId],
          );

          return {
            readingId: tbrId,
            bookId: entry.book_id,
            alreadyLogged: false,
          };
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },
  };
}
