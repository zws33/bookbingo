import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { readingRepository } from '../readings/postgresStore.js';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import {
  seedBook,
  seedChallenge,
  seedMembership,
  seedTag,
  seedUser,
} from '../testing/factories.js';
import { tbrEntryRepository } from './postgresStore.js';

const ABSENT_ID = '00000000-0000-0000-0000-000000000000';

const rejectsWith = (kind: string) => (error: unknown) => {
  assert.ok(
    error instanceof DomainError,
    `expected a DomainError, got ${String(error)}`,
  );
  assert.equal(error.kind, kind);
  return true;
};

describe('tbrEntryRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => tbrEntryRepository(testDb.db);
  const readings = () => readingRepository(testDb.db);

  async function challenge() {
    const pool = testDb.db;
    const userId = await seedUser(pool);
    const challengeId = await seedChallenge(pool, { createdBy: userId });
    await seedMembership(pool, { challengeId, userId, role: 'owner' });
    const bookId = await seedBook(pool);
    return { pool, userId, challengeId, bookId };
  }

  describe('create', () => {
    test('stores the entry with its planned tags and notes', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });

      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [tagId],
        notes: 'Borrowed from the library',
      });

      const [entry] = await repository().list(challengeId, userId);
      assert.equal(entry?.id, tbrId);
      assert.equal(entry?.userId, userId);
      assert.equal(entry?.bookId, bookId);
      assert.deepEqual(entry?.plannedTagIds, [tagId]);
      assert.equal(entry?.notes, 'Borrowed from the library');
      assert.ok(entry?.addedAt instanceof Date);
      assert.equal(entry?.updatedAt, undefined);
    });

    test('omits notes entirely when there are none', async () => {
      const { userId, challengeId, bookId } = await challenge();

      await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      const [entry] = await repository().list(challengeId, userId);
      assert.equal('notes' in (entry ?? {}), false);
      assert.deepEqual(entry?.plannedTagIds, []);
    });

    test('refuses a book that is not in the catalog', async () => {
      const { userId, challengeId } = await challenge();

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId: 'f'.repeat(32),
          plannedTagIds: [],
        }),
        rejectsWith('not-found'),
      );
    });

    test('refuses an entry for someone who was never a member', async () => {
      const { pool, challengeId, bookId } = await challenge();
      const stranger = await seedUser(pool);

      await assert.rejects(
        repository().create(challengeId, stranger, {
          bookId,
          plannedTagIds: [],
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
          plannedTagIds: [theirTag],
        }),
        rejectsWith('invalid-input'),
      );

      assert.equal((await pool.query('select 1 from tbr_entries')).rowCount, 0);
    });

    test('refuses notes past the column limit', async () => {
      const { userId, challengeId, bookId } = await challenge();

      await assert.rejects(
        repository().create(challengeId, userId, {
          bookId,
          plannedTagIds: [],
          notes: 'x'.repeat(2001),
        }),
        rejectsWith('invalid-input'),
      );
    });
  });

  describe('list', () => {
    test('returns one member’s entries, newest first', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const older = await seedBook(pool);
      await pool.query(
        `insert into tbr_entries (challenge_id, user_id, book_id, added_at)
         values ($1, $2, $3, now() - interval '2 days')`,
        [challengeId, userId, older],
      );
      await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      assert.deepEqual(
        (await repository().list(challengeId, userId)).map((e) => e.bookId),
        [bookId, older],
      );
    });

    test('excludes another member and another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedUser(pool);
      await seedMembership(pool, { challengeId, userId: other });
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      await repository().create(challengeId, other, {
        bookId,
        plannedTagIds: [],
      });
      await repository().create(second, userId, { bookId, plannedTagIds: [] });

      assert.deepEqual(await repository().list(challengeId, userId), []);
    });

    test('is empty for a malformed challenge id', async () => {
      assert.deepEqual(await repository().list('not-a-uuid', 'nobody'), []);
    });
  });

  describe('get', () => {
    test('returns the entry and its author', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      const entry = await repository().get(challengeId, tbrId);

      assert.equal(entry?.id, tbrId);
      assert.equal(entry?.userId, userId);
    });

    test('returns undefined for an entry in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const tbrId = await repository().create(second, userId, {
        bookId,
        plannedTagIds: [],
      });

      assert.equal(await repository().get(challengeId, tbrId), undefined);
    });
  });

  describe('update', () => {
    test('replaces the planned tags and the notes', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const first = await seedTag(pool, { challengeId, label: 'Debut' });
      const second = await seedTag(pool, { challengeId, label: 'Translated' });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [first],
        notes: 'Original',
      });

      await repository().update(challengeId, tbrId, {
        plannedTagIds: [second],
        notes: 'Revised',
      });

      const entry = await repository().get(challengeId, tbrId);
      assert.deepEqual(entry?.plannedTagIds, [second]);
      assert.equal(entry?.notes, 'Revised');
      assert.equal(entry?.bookId, bookId);
      assert.ok(entry?.updatedAt instanceof Date);
    });

    test('clears the notes when given none', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
        notes: 'Original',
      });

      await repository().update(challengeId, tbrId, { plannedTagIds: [] });

      assert.equal(
        'notes' in ((await repository().get(challengeId, tbrId)) ?? {}),
        false,
      );
    });

    test('refuses to reach an entry in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const tbrId = await repository().create(second, userId, {
        bookId,
        plannedTagIds: [],
        notes: 'Theirs',
      });

      await assert.rejects(
        repository().update(challengeId, tbrId, { plannedTagIds: [] }),
        rejectsWith('not-found'),
      );

      assert.equal((await repository().get(second, tbrId))?.notes, 'Theirs');
    });

    test('rejects an entry that is gone', async () => {
      const { challengeId } = await challenge();

      await assert.rejects(
        repository().update(challengeId, ABSENT_ID, { plannedTagIds: [] }),
        rejectsWith('not-found'),
      );
    });
  });

  describe('remove', () => {
    test('deletes the entry and its planned tag rows', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const tagId = await seedTag(pool, { challengeId });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [tagId],
      });

      await repository().remove(challengeId, tbrId);

      assert.deepEqual(await repository().list(challengeId, userId), []);
      assert.equal(
        (await pool.query('select 1 from tbr_entry_tags')).rowCount,
        0,
      );
      assert.equal((await pool.query('select 1 from tags')).rowCount, 1);
    });

    test('rejects an entry that is already gone', async () => {
      const { challengeId } = await challenge();
      await assert.rejects(
        repository().remove(challengeId, ABSENT_ID),
        rejectsWith('not-found'),
      );
    });
  });

  describe('promote', () => {
    test('logs a reading at the entry’s id and deletes the entry', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const planned = await seedTag(pool, { challengeId, label: 'Planned' });
      const logged = await seedTag(pool, { challengeId, label: 'Logged' });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [planned],
      });

      const outcome = await repository().promote({
        challengeId,
        userId,
        tbrId,
        tagIds: [logged],
        isFreebie: false,
      });

      assert.deepEqual(outcome, {
        readingId: tbrId,
        bookId,
        alreadyLogged: false,
      });
      const reading = await readings().get(challengeId, tbrId);
      assert.equal(reading?.userId, userId);
      assert.equal(reading?.bookId, bookId);
      assert.deepEqual(
        reading?.tagIds,
        [logged],
        'the logged tags, not the planned ones',
      );
      assert.deepEqual(await repository().list(challengeId, userId), []);
    });

    test('promotes as a freebie', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      await repository().promote({
        challengeId,
        userId,
        tbrId,
        tagIds: [],
        isFreebie: true,
      });

      assert.equal((await readings().get(challengeId, tbrId))?.isFreebie, true);
    });

    test('reports the reading a lost response already created', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });
      const promotion = {
        challengeId,
        userId,
        tbrId,
        tagIds: [],
        isFreebie: false,
      };
      await repository().promote(promotion);

      const outcome = await repository().promote(promotion);

      assert.deepEqual(outcome, {
        readingId: tbrId,
        bookId,
        alreadyLogged: true,
      });
      assert.equal(
        (await readings().list(challengeId, userId)).length,
        1,
        'the retry must not log a second reading',
      );
    });

    test('leaves the entry in place when the freebie rule rejects it', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedBook(pool);
      await readings().create(challengeId, userId, {
        bookId: other,
        tagIds: [],
        isFreebie: true,
      });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      await assert.rejects(
        repository().promote({
          challengeId,
          userId,
          tbrId,
          tagIds: [],
          isFreebie: true,
        }),
        rejectsWith('conflict'),
      );

      assert.equal((await repository().list(challengeId, userId)).length, 1);
      assert.equal(await readings().get(challengeId, tbrId), undefined);
    });

    test('leaves the entry in place when a tag is rejected', async () => {
      const { userId, challengeId, bookId } = await challenge();
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      await assert.rejects(
        repository().promote({
          challengeId,
          userId,
          tbrId,
          tagIds: [ABSENT_ID],
          isFreebie: false,
        }),
        rejectsWith('invalid-input'),
      );

      assert.equal((await repository().list(challengeId, userId)).length, 1);
      assert.equal(await readings().get(challengeId, tbrId), undefined);
    });

    test('rejects an entry that never existed', async () => {
      const { userId, challengeId } = await challenge();

      await assert.rejects(
        repository().promote({
          challengeId,
          userId,
          tbrId: ABSENT_ID,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );
    });

    test('refuses to reach an entry in another challenge', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: second, userId });
      const tbrId = await repository().create(second, userId, {
        bookId,
        plannedTagIds: [],
      });

      await assert.rejects(
        repository().promote({
          challengeId,
          userId,
          tbrId,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );

      assert.ok(await repository().get(second, tbrId));
    });

    test('refuses to reach another member’s entry', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedUser(pool);
      await seedMembership(pool, { challengeId, userId: other });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });

      await assert.rejects(
        repository().promote({
          challengeId,
          userId: other,
          tbrId,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );

      assert.ok(await repository().get(challengeId, tbrId));
      assert.equal(await readings().get(challengeId, tbrId), undefined);
    });

    test('refuses to report another member’s already-logged reading', async () => {
      const { pool, userId, challengeId, bookId } = await challenge();
      const other = await seedUser(pool);
      await seedMembership(pool, { challengeId, userId: other });
      const tbrId = await repository().create(challengeId, userId, {
        bookId,
        plannedTagIds: [],
      });
      await repository().promote({
        challengeId,
        userId,
        tbrId,
        tagIds: [],
        isFreebie: false,
      });

      await assert.rejects(
        repository().promote({
          challengeId,
          userId: other,
          tbrId,
          tagIds: [],
          isFreebie: false,
        }),
        rejectsWith('not-found'),
      );
    });
  });
});
