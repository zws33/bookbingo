import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { closePool, getPool } from '../db/pool.js';
import { requireTestDatabase, resetDatabase } from '../testing/db.js';
import {
  seedBook,
  seedChallenge,
  seedMembership,
  seedReading,
  seedReadingTag,
  seedTag,
  seedTbrEntry,
  seedTbrEntryTag,
  seedUser,
} from '../testing/factories.js';
import { tagRepository } from './postgresStore.js';

const ABSENT_ID = '00000000-0000-0000-0000-000000000000';

const rejectsWith = (kind: string) => (error: unknown) => {
  assert.ok(
    error instanceof DomainError,
    `expected a DomainError, got ${String(error)}`,
  );
  assert.equal(error.kind, kind);
  return true;
};

describe('tagRepository', () => {
  before(() => {
    requireTestDatabase();
  });
  beforeEach(resetDatabase);
  after(closePool);

  const repository = () => tagRepository();

  /** A challenge with one active member, which readings and TBR entries require. */
  async function challengeWithMember() {
    const pool = getPool();
    const userId = await seedUser(pool);
    const challengeId = await seedChallenge(pool, { createdBy: userId });
    await seedMembership(pool, { challengeId, userId, role: 'owner' });
    return { pool, userId, challengeId };
  }

  describe('listByChallenge', () => {
    test('returns the challenge vocabulary ordered by label', async () => {
      const { pool, challengeId } = await challengeWithMember();
      await seedTag(pool, { challengeId, label: 'Translated' });
      await seedTag(pool, { challengeId, label: 'Debut' });

      assert.deepEqual(
        (await repository().listByChallenge(challengeId)).map(
          (tag) => tag.label,
        ),
        ['Debut', 'Translated'],
      );
    });

    test('excludes another challenge’s vocabulary', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const other = await seedChallenge(pool, { createdBy: userId });
      await seedTag(pool, { challengeId, label: 'Mine' });
      await seedTag(pool, { challengeId: other, label: 'Theirs' });

      assert.deepEqual(
        (await repository().listByChallenge(challengeId)).map(
          (tag) => tag.label,
        ),
        ['Mine'],
      );
    });

    test('is empty for a challenge with no tags', async () => {
      const { challengeId } = await challengeWithMember();
      assert.deepEqual(await repository().listByChallenge(challengeId), []);
    });

    test('is empty for a malformed challenge id', async () => {
      assert.deepEqual(await repository().listByChallenge('not-a-uuid'), []);
    });
  });

  describe('create', () => {
    test('returns the new id and the tag is readable', async () => {
      const { challengeId } = await challengeWithMember();

      const tagId = await repository().create(challengeId, 'Debut');

      assert.deepEqual(await repository().listByChallenge(challengeId), [
        { id: tagId, label: 'Debut' },
      ]);
    });

    test('rejects a label that differs only in case', async () => {
      const { challengeId } = await challengeWithMember();
      await repository().create(challengeId, 'Mystery');

      await assert.rejects(
        repository().create(challengeId, 'mystery'),
        rejectsWith('conflict'),
      );
    });

    test('allows the same label in a different challenge', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const other = await seedChallenge(pool, { createdBy: userId });
      await repository().create(challengeId, 'Mystery');

      await repository().create(other, 'Mystery');

      assert.equal((await repository().listByChallenge(other)).length, 1);
    });

    test('rejects a blank label', async () => {
      const { challengeId } = await challengeWithMember();
      await assert.rejects(
        repository().create(challengeId, '   '),
        rejectsWith('invalid-input'),
      );
    });

    test('rejects a label past the column limit', async () => {
      const { challengeId } = await challengeWithMember();
      await assert.rejects(
        repository().create(challengeId, 'x'.repeat(101)),
        rejectsWith('invalid-input'),
      );
    });

    test('rejects a challenge that does not exist', async () => {
      await assert.rejects(
        repository().create(ABSENT_ID, 'Debut'),
        rejectsWith('not-found'),
      );
    });
  });

  describe('update', () => {
    test('renames the tag', async () => {
      const { pool, challengeId } = await challengeWithMember();
      const tagId = await seedTag(pool, { challengeId, label: 'Debut' });

      await repository().update(challengeId, tagId, 'First novel');

      assert.deepEqual(await repository().listByChallenge(challengeId), [
        { id: tagId, label: 'First novel' },
      ]);
    });

    test('rejects a rename onto another label in the same challenge', async () => {
      const { pool, challengeId } = await challengeWithMember();
      await seedTag(pool, { challengeId, label: 'Mystery' });
      const tagId = await seedTag(pool, { challengeId, label: 'Debut' });

      await assert.rejects(
        repository().update(challengeId, tagId, 'MYSTERY'),
        rejectsWith('conflict'),
      );
    });

    test('refuses to reach a tag belonging to another challenge', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const other = await seedChallenge(pool, { createdBy: userId });
      const theirTag = await seedTag(pool, {
        challengeId: other,
        label: 'Theirs',
      });

      await assert.rejects(
        repository().update(challengeId, theirTag, 'Mine'),
        rejectsWith('not-found'),
      );

      assert.equal(
        (await repository().listByChallenge(other))[0]?.label,
        'Theirs',
      );
    });

    test('rejects a tag that does not exist', async () => {
      const { challengeId } = await challengeWithMember();
      await assert.rejects(
        repository().update(challengeId, ABSENT_ID, 'Debut'),
        rejectsWith('not-found'),
      );
    });
  });

  describe('remove', () => {
    test('deletes a tag nothing has used', async () => {
      const { pool, challengeId } = await challengeWithMember();
      const tagId = await seedTag(pool, { challengeId });

      await repository().remove(challengeId, tagId);

      assert.deepEqual(await repository().listByChallenge(challengeId), []);
    });

    test('refuses a tag with reading history, and says why', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const tagId = await seedTag(pool, { challengeId });
      const bookId = await seedBook(pool);
      const readingId = await seedReading(pool, {
        challengeId,
        userId,
        bookId,
      });
      await seedReadingTag(pool, { readingId, tagId, challengeId });

      await assert.rejects(
        repository().remove(challengeId, tagId),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.kind, 'conflict');
          assert.match(error.message, /logged against it|history/i);
          return true;
        },
      );

      assert.equal((await repository().listByChallenge(challengeId)).length, 1);
    });

    test('refuses a tag a reading list entry still plans', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const tagId = await seedTag(pool, { challengeId });
      const bookId = await seedBook(pool);
      const tbrEntryId = await seedTbrEntry(pool, {
        challengeId,
        userId,
        bookId,
      });
      await seedTbrEntryTag(pool, { tbrEntryId, tagId, challengeId });

      await assert.rejects(
        repository().remove(challengeId, tagId),
        rejectsWith('conflict'),
      );
    });

    test('refuses to reach a tag belonging to another challenge', async () => {
      const { pool, userId, challengeId } = await challengeWithMember();
      const other = await seedChallenge(pool, { createdBy: userId });
      const theirTag = await seedTag(pool, { challengeId: other });

      await assert.rejects(
        repository().remove(challengeId, theirTag),
        rejectsWith('not-found'),
      );

      assert.equal((await repository().listByChallenge(other)).length, 1);
    });

    test('rejects a tag that does not exist', async () => {
      const { challengeId } = await challengeWithMember();
      await assert.rejects(
        repository().remove(challengeId, ABSENT_ID),
        rejectsWith('not-found'),
      );
    });
  });
});
