import type pg from 'pg';
import { DomainError } from '../common/errors.js';
import {
  MAX_ACTIVE_MEMBERSHIPS,
  requireCompleteScan,
} from '../common/limits.js';
import type { ConstraintMessages } from '../common/pgErrors.js';
import { dbErrors } from '../db/errors.js';
import { getPool } from '../db/pool.js';
import { inTransaction, type Db } from '../db/transaction.js';
import { generateJoinCode } from './joinCode.js';
import { canTransition } from './permissions.js';
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

/**
 * A roster row: the membership with the person it belongs to. The client never
 * joins memberships to profiles, so the read that renders a roster carries the
 * name and photo with it.
 */
export interface ChallengeMember extends Membership {
  name: string;
  photoURL: string | null;
}

export interface ChallengeMembership {
  challenge: Challenge;
  membership: Membership;
}

export interface ChallengeRepository {
  get(challengeId: string): Promise<Challenge>;
  /** One query instead of `listActiveMemberships` plus a `get` per entry. */
  getChallengesByUserId(userId: string): Promise<ChallengeMembership[]>;
  create(
    userId: string,
    fields: ChallengeFields,
  ): Promise<{ challengeId: string; joinCode: string }>;
  update(challengeId: string, fields: ChallengeUpdate): Promise<void>;
  /**
   * Reads the current status under a lock and applies `canTransition` in the
   * transaction that writes, so of two owners racing to complete an `active`
   * challenge the second gets a `conflict` rather than silently reopening it.
   * Returns the status it moved from, which the caller logs.
   */
  setStatus(
    challengeId: string,
    status: ChallengeStatus,
  ): Promise<ChallengeStatus>;
  remove(challengeId: string): Promise<void>;
  getMembership(
    challengeId: string,
    userId: string,
  ): Promise<Membership | undefined>;
  listMembers(challengeId: string): Promise<ChallengeMember[]>;
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
  /**
   * Refuses the last active owner (rule 21). The count and the write are one
   * transaction here because a handler cannot open one.
   */
  leave(challengeId: string, userId: string): Promise<void>;
  /**
   * Refuses a demotion that would leave no active owner (rule 21), under the
   * same lock and for the same reason as `leave`.
   */
  setRole(challengeId: string, userId: string, role: MemberRole): Promise<void>;
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

interface ChallengeMemberRow extends MembershipRow {
  name: string;
  photo_url: string | null;
}

interface ChallengeMembershipRow extends ChallengeRow {
  user_id: string;
  role: MemberRole;
  membership_status: MembershipStatus;
  joined_at: Date;
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
function toChallengeMember(row: ChallengeMemberRow): ChallengeMember {
  return { ...toMembership(row), name: row.name, photoURL: row.photo_url };
}

const MEMBERSHIP_COLUMNS = 'user_id, role, status, joined_at';

/**
 * Exported because the handler throws it too: a non-member must get a message
 * identical to a missing challenge's, or the difference confirms the challenge
 * exists (rule 45).
 */
export const CHALLENGE_GONE = 'That challenge no longer exists.';

const BLOCKED =
  'That challenge cannot be deleted while readings or reading list entries exist in it.';

const STATUS_RACED =
  'That challenge status changed while you were working. Reload and try again.';

const LAST_OWNER =
  'The last owner cannot leave. Promote another owner first, then leave.';

const LAST_OWNER_ROLE =
  'The last owner cannot step down. Promote another owner first.';

const ACTIVE_OWNERS = `select user_id from memberships
  where challenge_id = $1 and role = 'owner' and status = 'active'
  order by user_id
  for update`;

const CHALLENGE_ERRORS: ConstraintMessages = {
  challenges_created_by_fkey: ['not-found', 'That user no longer exists.'],
  challenges_name_check: ['invalid-input', 'Name must be 1 to 100 characters.'],
  challenges_tag_cap_check: [
    'invalid-input',
    'The tag cap must be above zero.',
  ],
  memberships_user_id_fkey: ['not-found', 'That user no longer exists.'],
  memberships_challenge_id_fkey: ['not-found', CHALLENGE_GONE],
  join_codes_challenge_id_fkey: ['not-found', CHALLENGE_GONE],
  join_codes_created_by_fkey: ['not-found', 'That user no longer exists.'],
  readings_challenge_id_user_id_fkey: ['conflict', BLOCKED],
  tbr_entries_challenge_id_user_id_fkey: ['conflict', BLOCKED],
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
  const mapError = dbErrors('challenges', {
    constraints: CHALLENGE_ERRORS,
    malformedId: CHALLENGE_GONE,
  });

  /**
   * Postgres rejects a non-uuid before reading a row, where an absent id is
   * simply not found. The `malformedId` rule that covers it only fires on a
   * uuid parameter, so the reads keyed by `user_id` or `code` — both `text` —
   * share this wrapper for its failure logging alone.
   */
  async function query<R extends pg.QueryResultRow>(
    operation: string,
    sql: string,
    values: readonly unknown[],
  ) {
    try {
      return await db.query<R>(sql, values);
    } catch (error) {
      throw mapError(operation, error);
    }
  }

  return {
    async get(challengeId) {
      const { rows } = await query<ChallengeRow>(
        'get',
        `select ${CHALLENGE_COLUMNS} from challenges where id = $1`,
        [challengeId],
      );
      const row = rows[0];
      if (!row) throw new DomainError('not-found', CHALLENGE_GONE);
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
        throw mapError('create', error);
      }
    },

    async update(challengeId, { name, tagCap }) {
      const { rowCount } = await query(
        'update',
        `update challenges
            set name = coalesce($2, name),
                tag_cap = coalesce($3, tag_cap),
                updated_at = now()
          where id = $1`,
        [challengeId, name ?? null, tagCap ?? null],
      );
      if (rowCount === 0) throw new DomainError('not-found', CHALLENGE_GONE);
    },

    async setStatus(challengeId, status) {
      try {
        return await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ status: ChallengeStatus }>(
            'select status from challenges where id = $1 for update',
            [challengeId],
          );
          const row = rows[0];
          if (!row) throw new DomainError('not-found', CHALLENGE_GONE);

          // Under the lock the caller's own check cannot have gone stale on
          // its own, so a refusal here is a race with another writer.
          if (!canTransition(row.status, status)) {
            throw new DomainError('conflict', STATUS_RACED, {
              status: row.status,
            });
          }

          await client.query(
            'update challenges set status = $2, updated_at = now() where id = $1',
            [challengeId, status],
          );
          return row.status;
        });
      } catch (error) {
        throw mapError('setStatus', error);
      }
    },

    /**
     * Nothing in the subtree cascades, so each child is deleted by name.
     * Memberships go first because that is where history stops the delete:
     * `readings` and `tbr_entries` hold the membership row down, and clearing
     * them is an explicit script, never this method.
     */
    async remove(challengeId) {
      try {
        await inTransaction(db, async (client) => {
          for (const table of ['memberships', 'tags', 'join_codes']) {
            await client.query(`delete from ${table} where challenge_id = $1`, [
              challengeId,
            ]);
          }

          const { rowCount } = await client.query(
            'delete from challenges where id = $1',
            [challengeId],
          );
          if (rowCount === 0)
            throw new DomainError('not-found', CHALLENGE_GONE);
        });
      } catch (error) {
        throw mapError('remove', error);
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
        const mapped = mapError('getMembership', error);
        if (mapped instanceof DomainError && mapped.kind === 'not-found') {
          return undefined;
        }
        throw mapped;
      }
    },

    async listMembers(challengeId) {
      const { rows } = await query<ChallengeMemberRow>(
        'listMembers',
        `select m.user_id, m.role, m.status, m.joined_at, u.name, u.photo_url
          from memberships m
          join users u on u.id = m.user_id
          where m.challenge_id = $1
          order by m.joined_at, m.user_id`,
        [challengeId],
      );
      return rows.map(toChallengeMember);
    },

    async listActiveMemberships(userId) {
      const { rows } = await query<MembershipRow & { challenge_id: string }>(
        'listActiveMemberships',
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

    async getChallengesByUserId(userId) {
      const { rows } = await query<ChallengeMembershipRow>(
        'getChallengesByUserId',
        `select c.id, c.name, c.tag_cap, c.status, c.created_by, c.created_at,
                m.user_id, m.role, m.status as membership_status, m.joined_at
           from memberships m
           join challenges c on c.id = m.challenge_id
          where m.user_id = $1 and m.status = 'active'
          order by m.joined_at, c.id
          limit $2`,
        [userId, MAX_ACTIVE_MEMBERSHIPS + 1],
      );
      requireCompleteScan('memberships', rows, MAX_ACTIVE_MEMBERSHIPS);
      return rows.map((row) => ({
        challenge: toChallenge(row),
        membership: toMembership({
          user_id: row.user_id,
          role: row.role,
          status: row.membership_status,
          joined_at: row.joined_at,
        }),
      }));
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
        throw mapError('upsertMembership', error);
      }
    },

    async listActiveOwners(challengeId) {
      const { rows } = await query<{ user_id: string }>(
        'listActiveOwners',
        ACTIVE_OWNERS,
        [challengeId],
      );
      return rows.map((row) => row.user_id);
    },

    async leave(challengeId, userId) {
      try {
        await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ user_id: string }>(
            ACTIVE_OWNERS,
            [challengeId],
          );
          if (rows.length === 1 && rows[0]?.user_id === userId) {
            throw new DomainError('conflict', LAST_OWNER);
          }

          const { rowCount } = await client.query(
            `update memberships set status = 'left', updated_at = now()
              where challenge_id = $1 and user_id = $2 and status = 'active'`,
            [challengeId, userId],
          );
          if (rowCount === 0)
            throw new DomainError('not-found', CHALLENGE_GONE);
        });
      } catch (error) {
        throw mapError('leave', error);
      }
    },

    async setRole(challengeId, userId, role) {
      try {
        await inTransaction(db, async (client) => {
          const { rows } = await client.query<{ user_id: string }>(
            ACTIVE_OWNERS,
            [challengeId],
          );
          if (
            role !== 'owner' &&
            rows.length === 1 &&
            rows[0]?.user_id === userId
          ) {
            throw new DomainError('conflict', LAST_OWNER_ROLE);
          }

          const { rowCount } = await client.query(
            `update memberships set role = $3, updated_at = now()
              where challenge_id = $1 and user_id = $2 and status = 'active'`,
            [challengeId, userId, role],
          );
          if (rowCount === 0)
            throw new DomainError('not-found', CHALLENGE_GONE);
        });
      } catch (error) {
        throw mapError('setRole', error);
      }
    },

    async findByJoinCode(code) {
      const { rows } = await query<{ challenge_id: string }>(
        'findByJoinCode',
        'select challenge_id from join_codes where code = $1',
        [code],
      );
      const row = rows[0];
      return row ? { challengeId: row.challenge_id } : undefined;
    },

    async getJoinCode(challengeId) {
      const { rows } = await query<{ code: string }>(
        'getJoinCode',
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
          if (rowCount === 0)
            throw new DomainError('not-found', CHALLENGE_GONE);

          await client.query('delete from join_codes where challenge_id = $1', [
            challengeId,
          ]);
          return insertJoinCode(client, challengeId, createdBy, generateCode);
        });
      } catch (error) {
        throw mapError('rotateJoinCode', error);
      }
    },
  };
}
