import { DomainError } from '../common/errors.js';
import { toDomainError, type ConstraintMessages } from '../common/pgErrors.js';
import { getPool } from '../db/pool.js';
import type { Db } from '../db/transaction.js';

/** The challenge's tag vocabulary. `label` is what the client shows as a tile name. */
export interface Tag {
  id: string;
  label: string;
}

export interface TagRepository {
  listByChallenge(challengeId: string): Promise<Tag[]>;
  create(challengeId: string, label: string): Promise<string>;
  /**
   * `challengeId` scopes the write as well as authorizing it: a tag id from
   * another challenge resolves to no row rather than being edited.
   */
  update(challengeId: string, tagId: string, label: string): Promise<void>;
  remove(challengeId: string, tagId: string): Promise<void>;
}

const GONE = 'That tag no longer exists.';

const TAG_ERRORS: ConstraintMessages = {
  tags_challenge_label_idx: [
    'conflict',
    'That tag already exists in this challenge.',
  ],
  tags_label_check: ['invalid-input', 'A tag must be 1 to 100 characters.'],
  tags_challenge_id_fkey: ['not-found', 'That challenge no longer exists.'],
  // `restrict`, not `cascade`: deleting a tag with history would silently drop
  // its rows and change every member's score.
  reading_tags_tag_id_challenge_id_fkey: [
    'conflict',
    'That tag cannot be deleted while readings are logged against it.',
  ],
  tbr_entry_tags_tag_id_challenge_id_fkey: [
    'conflict',
    'That tag cannot be deleted while reading list entries still plan it.',
  ],
};

export function tagRepository(db: Db = getPool()): TagRepository {
  const rules = { constraints: TAG_ERRORS, malformedId: GONE };

  return {
    async listByChallenge(challengeId) {
      try {
        const { rows } = await db.query<Tag>(
          `select id, label from tags
            where challenge_id = $1
            order by label, id`,
          [challengeId],
        );
        return rows;
      } catch (error) {
        // A malformed id names no challenge, which has no vocabulary.
        const mapped = toDomainError(error, rules);
        if (mapped instanceof DomainError && mapped.kind === 'not-found') {
          return [];
        }
        throw mapped;
      }
    },

    async create(challengeId, label) {
      try {
        const { rows } = await db.query<{ id: string }>(
          'insert into tags (challenge_id, label) values ($1, $2) returning id',
          [challengeId, label],
        );
        const id = rows[0]?.id;
        if (!id) throw new Error('insert into tags returned no id');
        return id;
      } catch (error) {
        throw toDomainError(error, {
          ...rules,
          malformedId: 'That challenge no longer exists.',
        });
      }
    },

    async update(challengeId, tagId, label) {
      try {
        const { rowCount } = await db.query(
          'update tags set label = $3 where id = $2 and challenge_id = $1',
          [challengeId, tagId, label],
        );
        if (rowCount === 0) throw new DomainError('not-found', GONE);
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },

    async remove(challengeId, tagId) {
      try {
        const { rowCount } = await db.query(
          'delete from tags where id = $2 and challenge_id = $1',
          [challengeId, tagId],
        );
        if (rowCount === 0) throw new DomainError('not-found', GONE);
      } catch (error) {
        throw toDomainError(error, rules);
      }
    },
  };
}
