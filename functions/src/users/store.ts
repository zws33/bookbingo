import type { UserProfile } from '@bookbingo/lib-types';
import { MAX_USERS_SCAN, requireCompleteScan } from '../common/limits.js';
import { getPool } from '../db/pool.js';
import type { Db } from '../db/transaction.js';

export interface UserProfileRepository {
  list(): Promise<UserProfile[]>;
  /** `null` when the id has no row, which is normal — see getUserProfileHandler. */
  get(userId: string): Promise<UserProfile | null>;
  upsert(profile: UserProfile): Promise<void>;
}

interface UserRow {
  id: string;
  name: string;
  photo_url: string | null;
}

/**
 * `photoURL` is `null` rather than absent: the client's optional-property form
 * does not survive JSON, where an omitted key and an explicit null read the same.
 */
function toUserProfile(row: UserRow): UserProfile {
  return { id: row.id, name: row.name, photoURL: row.photo_url };
}

const COLUMNS = 'id, name, photo_url';

export function userProfileRepository(
  db: Db = getPool(),
): UserProfileRepository {
  return {
    async list() {
      const { rows } = await db.query<UserRow>(
        `select ${COLUMNS} from users order by name, id limit $1`,
        [MAX_USERS_SCAN + 1],
      );
      requireCompleteScan('users', rows, MAX_USERS_SCAN);
      return rows.map(toUserProfile);
    },

    async get(userId) {
      const { rows } = await db.query<UserRow>(
        `select ${COLUMNS} from users where id = $1`,
        [userId],
      );
      const row = rows[0];
      return row ? toUserProfile(row) : null;
    },

    async upsert({ id, name, photoURL }) {
      await db.query(
        `insert into users (id, name, photo_url) values ($1, $2, $3)
         on conflict (id) do update
            set name = excluded.name,
                photo_url = excluded.photo_url,
                updated_at = now()`,
        [id, name, photoURL],
      );
    },
  };
}
