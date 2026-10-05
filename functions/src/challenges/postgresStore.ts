import type pg from 'pg';
import { DomainError } from '../common/errors.js';
import {
  MAX_ACTIVE_MEMBERSHIPS,
  requireCompleteScan,
} from '../common/limits.js';
import { toDomainError, type ConstraintMessages } from '../common/pgErrors.js';
import { getPool } from '../db/pool.js';
import { inTransaction, type Db } from '../db/transaction.js';
import { generateJoinCode } from './joinCode.js';
import type {
  ChallengeStatus,
  MemberRole,
  MembershipStatus,
} from './schema.js';

export interface Challenge {
  id: string;
  name: string;
  status: ChallengeStatus;
  tagCap: number;
  createdBy: string;
  createdAt: Date;
}

export interface Membership {
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: Date;
}

export interface ChallengeFields {
  name: string;
  tagCap: number;
}

/**
 * Partial because the lifecycle unlocks the two separately: an `active`
 * challenge takes a rename but not a cap change.
 */
export interface ChallengeUpdate {
  name?: string | undefined;
  tagCap?: number | undefined;
}

export interface MembershipFields {
  role: MemberRole;
  status: MembershipStatus;
}

export interface ChallengeRepository {
  get(challengeId: string): Promise<Challenge>;
  create(
    userId: string,
    fields: ChallengeFields,
  ): Promise<{ challengeId: string; joinCode: string }>;
  update(challengeId: string, fields: ChallengeUpdate): Promise<void>;
  setStatus(challengeId: string, status: ChallengeStatus): Promise<void>;
  remove(challengeId: string): Promise<void>;
  getMembership(
    challengeId: string,
    userId: string,
  ): Promise<Membership | undefined>;
  listMembers(challengeId: string): Promise<Membership[]>;
  listActiveMemberships(userId: string): Promise<Map<string, Membership>>;
  upsertMembership(
    challengeId: string,
    userId: string,
    fields: MembershipFields,
  ): Promise<void>;
  /**
   * Locks the rows it returns, so two concurrent self-demotions cannot both
   * find a second owner and leave the challenge with none (rule 21). Call it
   * inside the transaction that performs the write — outside one the lock is
   * released as the statement ends and proves nothing.
   */
  listActiveOwners(challengeId: string): Promise<string[]>;
  findByJoinCode(code: string): Promise<{ challengeId: string } | undefined>;
  getJoinCode(challengeId: string): Promise<string | undefined>;
  rotateJoinCode(challengeId: string, createdBy: string): Promise<string>;
}

interface ChallengeRow {
  id: string;
  name: string;
  tag_cap: number;
  status: ChallengeStatus;
  created_by: string;
  created_at: Date;
}

interface MembershipRow {
  user_id: string;
  role: MemberRole;
  status: MembershipStatus;
  joined_at: Date;
}

interface DependentCountsRow {
  readings: number;
  tbr_entries: number;
}

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    tagCap: row.tag_cap,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMembership(row: MembershipRow): Membership {
  return {
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

const CHALLENGE_COLUMNS = 'id, name, tag_cap, status, created_by, created_at';
const MEMBERSHIP_COLUMNS = 'user_id, role, status, joined_at';

const GONE = 'That challenge no longer exists.';

const BLOCKED =
  'That challenge cannot be deleted while readings or reading list entries exist in it.';

const CHALLENGE_ERRORS: ConstraintMessages = {
  challenges_created_by_fkey: ['not-found', 'That user no longer exists.'],
  challenges_name_check: ['invalid-input', 'Name must be 1 to 100 characters.'],
  challenges_tag_cap_check: [
    'invalid-input',
    'The tag cap must be above zero.',
  ],
  memberships_user_id_fkey: ['not-found', 'That user no longer exists.'],
  memberships_challenge_id_fkey: ['not-found', GONE],
  join_codes_challenge_id_fkey: ['not-found', GONE],
  join_codes_created_by_fkey: ['not-found', 'That user no longer exists.'],
  // Only reachable when a reading or reading list entry is inserted between
  // `remove`'s count and its delete; the count reports the rows otherwise.
  reading_tags_tag_id_challenge_id_fkey: ['conflict', BLOCKED],
  tbr_entry_tags_tag_id_challenge_id_fkey: ['conflict', BLOCKED],
};

const JOIN_CODE_ATTEMPTS = 5;

function isCodeCollision(error: unknown): boolean {
  const { code, constraint } = (error ?? {}) as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === '23505' && constraint === 'join_codes_pkey';
}

async function insertJoinCode(
  client: Db,
  challengeId: string,
  createdBy: string,
  generate: () => string,
): Promise<string> {
  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    const code = generate();
    await client.query('savepoint join_code_attempt');
    try {
      await client.query(
        `insert into join_codes (code, challenge_id, created_by)
         values ($1, $2, $3)`,
        [code, challengeId, createdBy],
      );
      await client.query('release savepoint join_code_attempt');
      return code;
    } catch (error) {
      await client.query('rollback to savepoint join_code_attempt');
      if (!isCodeCollision(error)) throw error;
    }
  }

  throw new DomainError(
    'conflict',
    'Could not allocate a join code. Please try again.',
  );
}

export function challengeRepository(
  db: Db = getPool(),
  generateCode: () => string = generateJoinCode,
): ChallengeRepository {
  const rules = { constraints: CHALLENGE_ERRORS, malformedId: GONE };

  /** Postgres rejects a non-uuid before reading a row, where an absent id is simply not found. */
  async function query<R extends pg.QueryResultRow>(
    sql: string,
    values: readonly unknown[],
  ) {
    try {
      return await db.query<R>(sql, values);
    } catch (error) {
      throw toDomainError(error, rules);
    }
  }

  return {
    async get(challengeId) {
      const { rows } = await query<ChallengeRow>(
        `select ${CHALLENGE_COLUMNS} from challenges where id = $1`,
        [challengeId],
      );
      const row = rows[0];
      if (!row) throw new DomainError('not-found', GONE);
      return toChallenge(row);
    },

    async create(userId, { name, tagCap }) {
      try {
        return await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ id: string }>(
            `insert into challenges (name, tag_cap, created_by)
             values ($1, $2, $3) returning id`,
            [name, tagCap, userId],
          );
          const challengeId = rows[0]?.id;
          if (!challengeId) {
            throw new Error('insert into challenges returned no id');
          }

          await client.query(
            `insert into memberships (challenge_id, user_id, role, status)
             values ($1, $2, 'owner', 'active')`,
            [challengeId, userId],
          );

          const joinCode = await insertJoinCode(
            client,
            challengeId,
            userId,
            generateCode,
          );

          return { challengeId, joinCode };
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    async update(challengeId, { name, tagCap }) {
      const { rowCount } = await query(
        `update challenges
            set name = coalesce($2, name),
                tag_cap = coalesce($3, tag_cap),
                updated_at = now()
          where id = $1`,
        [challengeId, name ?? null, tagCap ?? null],
      );
      if (rowCount === 0) throw new DomainError('not-found', GONE);
    },

    async setStatus(challengeId, status) {
      const { rowCount } = await query(
        'update challenges set status = $2, updated_at = now() where id = $1',
        [challengeId, status],
      );
      if (rowCount === 0) throw new DomainError('not-found', GONE);
    },

    /**
     * Readings and reading list entries block the delete rather than cascading
     * with it. The schema cannot express that on its own: both reach the
     * challenge through the composite membership foreign key, which cascades,
     * and the `restrict` on the tag foreign keys only trips for a row that
     * happens to be tagged.
     */
    async remove(challengeId) {
      try {
        await inTransaction(db, async (client) => {
          const { rows } = await client.query<DependentCountsRow>(
            `select
               (select count(*)::int from readings where challenge_id = $1)
                 as readings,
               (select count(*)::int from tbr_entries where challenge_id = $1)
                 as tbr_entries`,
            [challengeId],
          );
          const counts = rows[0];
          if (!counts) throw new Error('counting dependents returned no row');

          const { readings, tbr_entries: tbrEntries } = counts;
          if (readings > 0 || tbrEntries > 0) {
            throw new DomainError('conflict', BLOCKED, {
              challengeId,
              readings,
              tbrEntries,
            });
          }

          const { rowCount } = await client.query(
            'delete from challenges where id = $1',
            [challengeId],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    // Absent and non-`active` are the same answer to the caller, so both are
    // left for the guard to reject rather than thrown on here.
    async getMembership(challengeId, userId) {
      try {
        const { rows } = await db.query<MembershipRow>(
          `select ${MEMBERSHIP_COLUMNS} from memberships
            where challenge_id = $1 and user_id = $2`,
          [challengeId, userId],
        );
        const row = rows[0];
        return row ? toMembership(row) : undefined;
      } catch (error) {
        // A malformed id cannot name a membership, which is the same as none.
        const mapped = toDomainError(error, rules);
        if (mapped instanceof DomainError && mapped.kind === 'not-found') {
          return undefined;
        }
        throw mapped;
      }
    },

    async listMembers(challengeId) {
      const { rows } = await db.query<MembershipRow>(
        `select ${MEMBERSHIP_COLUMNS} from memberships
          where challenge_id = $1
          order by joined_at, user_id`,
        [challengeId],
      );
      return rows.map(toMembership);
    },

    async listActiveMemberships(userId) {
      const { rows } = await db.query<MembershipRow & { challenge_id: string }>(
        `select challenge_id, ${MEMBERSHIP_COLUMNS} from memberships
          where user_id = $1 and status = 'active'
          order by joined_at, challenge_id
          limit $2`,
        [userId, MAX_ACTIVE_MEMBERSHIPS + 1],
      );
      requireCompleteScan('memberships', rows, MAX_ACTIVE_MEMBERSHIPS);
      return new Map(
        rows.map((row) => [row.challenge_id, toMembership(row)] as const),
      );
    },

    async upsertMembership(challengeId, userId, { role, status }) {
      try {
        await db.query(
          `insert into memberships (challenge_id, user_id, role, status)
           values ($1, $2, $3, $4)
           on conflict (challenge_id, user_id) do update
              set role = excluded.role,
                  status = excluded.status,
                  updated_at = now()`,
          [challengeId, userId, role, status],
        );
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    async listActiveOwners(challengeId) {
      const { rows } = await db.query<{ user_id: string }>(
        `select user_id from memberships
          where challenge_id = $1 and role = 'owner' and status = 'active'
          order by user_id
          for update`,
        [challengeId],
      );
      return rows.map((row) => row.user_id);
    },

    async findByJoinCode(code) {
      const { rows } = await db.query<{ challenge_id: string }>(
        'select challenge_id from join_codes where code = $1',
        [code],
      );
      const row = rows[0];
      return row ? { challengeId: row.challenge_id } : undefined;
    },

    async getJoinCode(challengeId) {
      const { rows } = await query<{ code: string }>(
        'select code from join_codes where challenge_id = $1',
        [challengeId],
      );
      return rows[0]?.code;
    },

    /**
     * Delete then insert in one transaction: `join_codes.challenge_id` is
     * unique, so there is no revoke without replacement — it would leave the
     * challenge unjoinable.
     */
    async rotateJoinCode(challengeId, createdBy) {
      try {
        return await inTransaction(db, async (client) => {
          const { rowCount } = await client.query(
            'select 1 from challenges where id = $1 for update',
            [challengeId],
          );
          if (rowCount === 0) throw new DomainError('not-found', GONE);

          await client.query('delete from join_codes where challenge_id = $1', [
            challengeId,
          ]);
          return insertJoinCode(client, challengeId, createdBy, generateCode);
        });
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },
  };
}
