import type pg from 'pg';
import { MAX_TILES_PER_BOOK } from '../../functions/src/domain/constants.js';
import { generateJoinCode } from '../../functions/src/challenges/joinCode.js';
import { CHALLENGE_ID } from './constants.js';

export interface ChallengeResult {
  name: string;
  joinCode: string | null;
  membersAdded: number;
  memberCount: number;
}

/**
 * Creates the challenge scaffolding once and never rewrites it. The challenge
 * callables are Postgres-backed, so `name`, `tag_cap`, `status`, the join code
 * and every membership role are live application data by now: an `on conflict
 * do update` here would revert a rename, a rotated code or a member who left.
 */
export async function migrateChallenge(
  pgClient: pg.Client,
  { name, ownerId }: { name: string; ownerId: string },
): Promise<ChallengeResult> {
  await pgClient.query('begin');

  await pgClient.query(
    `insert into challenges (id, name, tag_cap, status, created_by)
     values ($1, $2, $3, 'active', $4)
         on conflict (id) do nothing`,
    [CHALLENGE_ID, name, MAX_TILES_PER_BOOK, ownerId],
  );

  // Conflicts on `join_codes.challenge_id unique`, so the generated code is
  // discarded rather than rotating the one members already have.
  await pgClient.query(
    `insert into join_codes (code, challenge_id, created_by)
     values ($1, $2, $3)
         on conflict (challenge_id) do nothing`,
    [generateJoinCode(), CHALLENGE_ID, ownerId],
  );

  const added = await pgClient.query(
    `insert into memberships (challenge_id, user_id, role, status, joined_at)
     select $1, id,
            case when id = $2 then 'owner' else 'member' end::member_role,
            'active',
            created_at
       from users
         on conflict (challenge_id, user_id) do nothing
      returning 1`,
    [CHALLENGE_ID, ownerId],
  );

  const { rows } = await pgClient.query<{
    name: string;
    joinCode: string | null;
    memberCount: string;
  }>(
    `select c.name,
            j.code as "joinCode",
            (select count(*) from memberships m
              where m.challenge_id = c.id and m.status = 'active') as "memberCount"
       from challenges c
       left join join_codes j on j.challenge_id = c.id
      where c.id = $1`,
    [CHALLENGE_ID],
  );

  await pgClient.query('commit');

  const live = rows[0];
  if (!live)
    throw new Error(`challenge ${CHALLENGE_ID} is missing after upsert`);

  return {
    name: live.name,
    joinCode: live.joinCode,
    membersAdded: added.rowCount ?? 0,
    memberCount: Number(live.memberCount),
  };
}
