import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import {
  seedBook,
  seedChallenge,
  seedMembership,
  seedTag,
  seedUser,
} from '../testing/factories.js';
import { readingRepository } from './postgresStore.js';

const ABSENT_ID = '00000000-0000-0000-0000-000000000000';

const rejectsWith = (kind: string) => (error: unknown) => {
  assert.ok(
    error instanceof DomainError,
    `expected a DomainError, got ${String(error)}`,
  );
  assert.equal(error.kind, kind);
  return true;
};

describe('readingRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => readingRepository(testDb.db);

  async function challenge() {
    const pool = testDb.db;
    const userId = await seedUser(pool, { name: 'Ada' });
    const challengeId = await seedChallenge(pool, { createdBy: userId });
    await seedMembership(pool, { challengeId, userId, role: 'owner' });
    const bookId = await seedBook(pool);
    return { pool, userId, challengeId, bookId };
  }

  describe('create', () => {
    test('stores the reading with its tags', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const first = await seedTag(pool, { challengeId, label: 'Debut' });
      const second = await seedTag(pool, { challengeId, label: 'Translated' });

      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [first, second],
        isFreebie: false,
      });

      const [reading] = await repository().list(challengeId, userId);
      assert.equal(reading?.id, readingId);
      assert.equal(reading?.userId, userId);
      assert.equal(reading?.bookId, bookId);
      assert.deepEqual(reading?.tagIds.sort(), [first, second].sort());
      assert.equal(reading?.isFreebie, false);
      assert.ok(reading?.readAt instanceof Date);
      assert.ok(reading?.createdAt instanceof Date);
      assert.equal(reading?.updatedAt, undefined);
    });

    test('stores a freebie with no tags', async () => {
      const { userId, challengeId, bookId } = await challenge();

      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });

      const [reading] = await repository().list(challengeId, userId);
      assert.deepEqual(reading?.tagIds, []);
      assert.equal(reading?.isFreebie, true);
    });

    test('refuses a second freebie for the same member', async () => {
      const { userId, challengeId, bookId } = await challenge();
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });
      const other = await seedBook(testDb.db);

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId: other,
          tagIds: [],
          isFreebie: true,
        }),
        rejectsWith('conflict'),
      );
    });

    test('allows a freebie in each of two challenges', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });

      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });
      await repository().create(second, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });

      assert.equal((await repository().list(second, userId)).length, 1);
    });

    test('refuses a book that is not in the catalog', async () => {
      const { userId, challengeId } = await challenge();

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId: 'f'.repeat(32),
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );
    });

    test('refuses a reading for someone who was never a member', async () => {
      const { pool, challengeId, bookId } = await challenge();
      const stranger = await seedUser(pool);

      await assert.rejects(
        repository().create(challengeId, stranger, {
          bookId,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );
    });

    test('refuses a tag from another challenge’s vocabulary', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedChallenge(pool, { createdBy: userId });
      const theirTag = await seedTag(pool, { challengeId: other });

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId,
          tagIds: [theirTag],
          isFreebie: false,
        }),
        rejectsWith('invalid-input'),
      );

      assert.deepEqual(await repository().list(challengeId, userId), []);
    });

    test('writes no reading when a tag is rejected', async () => {
      const { userId, challengeId, bookId } = await challenge();

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId,
          tagIds: [ABSENT_ID],
          isFreebie: false,
        }),
        rejectsWith('invalid-input'),
      );

      assert.equal(
        (await testDb.db.query('select 1 from readings')).rowCount,
        0,
      );
    });
  });

  describe('list', () => {
    test('returns one member’s readings, newest first', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const older = await seedBook(pool);
      await pool.query(
        `insert into readings (challenge_id, user_id, book_id, read_at)
         values ($1, $2, $3, now() - interval '2 days')`,
        [challengeId, userId, older],
      );
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.deepEqual(
        (await repository().list(challengeId, userId)).map((r) => r.bookId),
        [bookId, older],
      );
    });

    test('excludes another member’s readings', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedUser(pool);
      await seedMembership(pool, { challengeId, userId: other });
      await repository().create(challengeId, other, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.deepEqual(await repository().list(challengeId, userId), []);
    });

    test('excludes the same member’s readings in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      await repository().create(second, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.deepEqual(await repository().list(challengeId, userId), []);
    });

    test('is empty for a malformed challenge id', async () => {
      assert.deepEqual(await repository().list('not-a-uuid', 'nobody'), []);
    });
  });

  describe('listByChallenge', () => {
    test('groups readings by member', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedUser(pool);
      await seedMembership(pool, { challengeId, userId: second });
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });
      await repository().create(challengeId, second, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      const byUser = await repository().listByChallenge(challengeId);

      assert.deepEqual([...byUser.keys()].sort(), [userId, second].sort());
      assert.equal(byUser.get(userId)?.length, 1);
    });

    test('omits the readings of a member who left', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const departed = await seedUser(pool);
      await seedMembership(pool, {
        challengeId,
        userId: departed,
        status: 'left',
      });
      await repository().create(challengeId, departed, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      const byUser = await repository().listByChallenge(challengeId);

      assert.deepEqual([...byUser.keys()], [userId]);
    });

    test('omits the readings of a removed member', async () => {
      const { pool, challengeId, bookId } = await challenge();
      const removed = await seedUser(pool);
      await seedMembership(pool, {
        challengeId,
        userId: removed,
        status: 'removed',
      });
      await repository().create(challengeId, removed, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.equal((await repository().listByChallenge(challengeId)).size, 0);
    });

    test('carries the tags of each reading', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [tagId],
        isFreebie: false,
      });

      const byUser = await repository().listByChallenge(challengeId);

      assert.deepEqual(byUser.get(userId)?.[0]?.tagIds, [tagId]);
    });
  });

  describe('get', () => {
    test('returns the reading and its author, for the guard to authorize', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      const reading = await repository().get(challengeId, readingId);

      assert.equal(reading?.id, readingId);
      assert.equal(reading?.userId, userId);
    });

    test('returns undefined for a reading in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const readingId = await repository().create(second, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.equal(await repository().get(challengeId, readingId), undefined);
    });

    test('returns undefined for an id no reading has', async () => {
      const { challengeId } = await challenge();
      assert.equal(await repository().get(challengeId, ABSENT_ID), undefined);
    });
  });

  describe('update', () => {
    test('replaces the book, the tags and the freebie flag', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const first = await seedTag(pool, { challengeId, label: 'Debut' });
      const second = await seedTag(pool, { challengeId, label: 'Translated' });
      const replacement = await seedBook(pool);
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [first],
        isFreebie: false,
      });

      await repository().update(challengeId, readingId, {
        bookId: replacement,
        tagIds: [second],
        isFreebie: true,
      });

      const reading = await repository().get(challengeId, readingId);
      assert.equal(reading?.bookId, replacement);
      assert.deepEqual(reading?.tagIds, [second]);
      assert.equal(reading?.isFreebie, true);
      assert.ok(reading?.updatedAt instanceof Date);
    });

    test('clears the tags when given none', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [tagId],
        isFreebie: false,
      });

      await repository().update(challengeId, readingId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.deepEqual(
        (await repository().get(challengeId, readingId))?.tagIds,
        [],
      );
    });

    test('keeps read_at, which is not the caller’s to change', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });
      const readAt = (await repository().get(challengeId, readingId))?.readAt;

      await repository().update(challengeId, readingId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      assert.deepEqual(
        (await repository().get(challengeId, readingId))?.readAt,
        readAt,
      );
    });

    test('refuses to reach a reading in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const readingId = await repository().create(second, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      await assert.rejects(
        repository().update(challengeId, readingId, {
          bookId,
          tagIds: [],
          isFreebie: true,
        }),
        rejectsWith('not-found'),
      );

      assert.equal(
        (await repository().get(second, readingId))?.isFreebie,
        false,
      );
    });

    test('refuses a second freebie', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedBook(pool);
      await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });
      const readingId = await repository().create(challengeId, userId, {
        bookId: other,
        tagIds: [],
        isFreebie: false,
      });

      await assert.rejects(
        repository().update(challengeId, readingId, {
          bookId: other,
          tagIds: [],
          isFreebie: true,
        }),
        rejectsWith('conflict'),
      );
    });

    test('keeps its own freebie flag when nothing else changes', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });

      await repository().update(challengeId, readingId, {
        bookId,
        tagIds: [],
        isFreebie: true,
      });

      assert.equal(
        (await repository().get(challengeId, readingId))?.isFreebie,
        true,
      );
    });

    test('rejects a reading that is gone', async () => {
      const { challengeId, bookId } = await challenge();

      await assert.rejects(
        repository().update(challengeId, ABSENT_ID, {
          bookId,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );
    });

    test('leaves the tags alone when the update fails', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [tagId],
        isFreebie: false,
      });

      await assert.rejects(
        repository().update(challengeId, readingId, {
          bookId,
          tagIds: [ABSENT_ID],
          isFreebie: false,
        }),
        rejectsWith('invalid-input'),
      );

      assert.deepEqual(
        (await repository().get(challengeId, readingId))?.tagIds,
        [tagId],
      );
    });
  });

  describe('remove', () => {
    test('deletes the reading and its tag rows', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });
      const readingId = await repository().create(challengeId, userId, {
        bookId,
        tagIds: [tagId],
        isFreebie: false,
      });

      await repository().remove(challengeId, readingId);

      assert.deepEqual(await repository().list(challengeId, userId), []);
      assert.equal(
        (await pool.query('select 1 from reading_tags')).rowCount,
        0,
      );
      assert.equal((await pool.query('select 1 from tags')).rowCount, 1);
    });

    test('refuses to reach a reading in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const readingId = await repository().create(second, userId, {
        bookId,
        tagIds: [],
        isFreebie: false,
      });

      await assert.rejects(
        repository().remove(challengeId, readingId),
        rejectsWith('not-found'),
      );

      assert.ok(await repository().get(second, readingId));
    });

    test('rejects a reading that is already gone', async () => {
      const { challengeId } = await challenge();
      await assert.rejects(
        repository().remove(challengeId, ABSENT_ID),
        rejectsWith('not-found'),
      );
    });
  });
});
