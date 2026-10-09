import type pg from 'pg';
import { MAX_TILES_PER_BOOK } from '../../functions/src/domain/constants.js';
import { generateJoinCode } from '../../functions/src/challenges/joinCode.js';
import { CHALLENGE_ID } from './constants.js';

export async function migrateChallenge(
  pgClient: pg.Client,
  { name, ownerId }: { name: string; ownerId: string },
): Promise<{ joinCode: string; memberCount: number }> {
  const joinCode = generateJoinCode();

  await pgClient.query('begin');

  await pgClient.query(
    `insert into challenges (id, name, tag_cap, status, created_by)
     values ($1, $2, $3, 'active', $4)`,
    [CHALLENGE_ID, name, MAX_TILES_PER_BOOK, ownerId],
  );

  await pgClient.query(
    `insert into join_codes (code, challenge_id, created_by)
     values ($1, $2, $3)`,
    [joinCode, CHALLENGE_ID, ownerId],
  );

  const { rowCount } = await pgClient.query(
    `insert into memberships (challenge_id, user_id, role, status, joined_at)
     select $1, id,
            case when id = $2 then 'owner' else 'member' end::member_role,
            'active',
            created_at
       from users`,
    [CHALLENGE_ID, ownerId],
  );

  await pgClient.query('commit');

  return { joinCode, memberCount: rowCount ?? 0 };
}
