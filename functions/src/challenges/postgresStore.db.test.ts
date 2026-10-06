import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { inTransaction } from '../db/transaction.js';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import {
  seedBook,
  seedChallenge,
  seedMembership,
  seedReading,
  seedReadingTag,
  seedTag,
  seedTbrEntry,
  seedUser,
} from '../testing/factories.js';
import { JOIN_CODE_PATTERN } from './joinCode.js';
import { challengeRepository } from './postgresStore.js';

const ABSENT_ID = '00000000-0000-0000-0000-000000000000';

const rejectsWith = (kind: string) => (error: unknown) => {
  assert.ok(
    error instanceof DomainError,
    `expected a DomainError, got ${String(error)}`,
  );
  assert.equal(error.kind, kind);
  return true;
};

describe('challengeRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => challengeRepository(testDb.db);

  describe('create', () => {
    test('inserts a draft challenge, its sole owner, and a join code', async () => {
      const userId = await seedUser(testDb.db);

      const { challengeId, joinCode } = await repository().create(userId, {
        name: 'Summer 2026',
        tagCap: 4,
      });

      const challenge = await repository().get(challengeId);
      assert.deepEqual(
        {
          name: challenge.name,
          status: challenge.status,
          tagCap: challenge.tagCap,
          createdBy: challenge.createdBy,
        },
        { name: 'Summer 2026', status: 'draft', tagCap: 4, createdBy: userId },
      );
      assert.ok(challenge.createdAt instanceof Date);
      assert.ok(
        JOIN_CODE_PATTERN.test(joinCode),
        `${joinCode} is not a join code`,
      );

      assert.deepEqual(await repository().getMembership(challengeId, userId), {
        userId,
        role: 'owner',
        status: 'active',
        joinedAt: (await repository().getMembership(challengeId, userId))
          ?.joinedAt,
      });
      assert.equal(
        (await repository().getMembership(challengeId, userId))?.role,
        'owner',
      );
    });

    test('rejects a creator who does not exist', async () => {
      await assert.rejects(
        repository().create('nobody', { name: 'Summer', tagCap: 3 }),
        rejectsWith('not-found'),
      );
    });

    test('rejects a blank name', async () => {
      const userId = await seedUser(testDb.db);
      await assert.rejects(
        repository().create(userId, { name: '   ', tagCap: 3 }),
        rejectsWith('invalid-input'),
      );
    });

    test('rejects a tag cap of zero', async () => {
      const userId = await seedUser(testDb.db);
      await assert.rejects(
        repository().create(userId, { name: 'Summer', tagCap: 0 }),
        rejectsWith('invalid-input'),
      );
    });

    test('writes nothing when the challenge insert fails', async () => {
      await assert.rejects(
        repository().create('nobody', { name: 'Summer', tagCap: 3 }),
        rejectsWith('not-found'),
      );

      const { rowCount } = await testDb.db.query('select 1 from join_codes');
      assert.equal(rowCount, 0);
    });

    test('tries another code when the generated one is taken', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const taken = challengeRepository(pool, () => 'ABCDEFGH');
      await taken.create(userId, { name: 'First', tagCap: 3 });

      const codes = ['ABCDEFGH', 'JKMNPQRS'];
      const retrying = challengeRepository(
        pool,
        () => codes.shift() ?? 'ZZZZZZZZ',
      );
      const { joinCode } = await retrying.create(userId, {
        name: 'Second',
        tagCap: 3,
      });

      assert.equal(joinCode, 'JKMNPQRS');
    });

    test('gives up after repeated collisions rather than looping', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const colliding = challengeRepository(pool, () => 'ABCDEFGH');
      await colliding.create(userId, { name: 'First', tagCap: 3 });

      await assert.rejects(
        colliding.create(userId, { name: 'Second', tagCap: 3 }),
        rejectsWith('conflict'),
      );
    });
  });

  describe('get', () => {
    test('rejects an id no challenge has', async () => {
      await assert.rejects(
        repository().get(ABSENT_ID),
        rejectsWith('not-found'),
      );
    });

    test('reports a malformed id as not found rather than failing', async () => {
      await assert.rejects(
        repository().get('not-a-uuid'),
        rejectsWith('not-found'),
      );
    });

    test('does not expose stored columns missing from the entity', async () => {
      const userId = await seedUser(testDb.db);
      const challengeId = await seedChallenge(testDb.db, { createdBy: userId });

      assert.deepEqual(
        Object.keys(await repository().get(challengeId)).sort(),
        ['createdAt', 'createdBy', 'id', 'name', 'status', 'tagCap'],
      );
    });
  });

  describe('update', () => {
    test('renames without touching the cap', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const challengeId = await seedChallenge(pool, {
        createdBy: userId,
        name: 'Old',
        tagCap: 4,
      });

      await repository().update(challengeId, { name: 'New' });

      const challenge = await repository().get(challengeId);
      assert.equal(challenge.name, 'New');
      assert.equal(challenge.tagCap, 4);
    });

    test('changes the cap without touching the name', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const challengeId = await seedChallenge(pool, {
        createdBy: userId,
        name: 'Old',
        tagCap: 4,
      });

      await repository().update(challengeId, { tagCap: 2 });

      const challenge = await repository().get(challengeId);
      assert.equal(challenge.name, 'Old');
      assert.equal(challenge.tagCap, 2);
    });

    test('stamps updated_at', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: userId });

      await repository().update(challengeId, { name: 'New' });

      const { rows } = await pool.query<{ updated_at: Date | null }>(
        'select updated_at from challenges where id = $1',
        [challengeId],
      );
      assert.ok(rows[0]?.updated_at instanceof Date);
    });

    test('rejects an update to a challenge that is gone', async () => {
      await assert.rejects(
        repository().update(ABSENT_ID, { name: 'New' }),
        rejectsWith('not-found'),
      );
    });

    test('rejects a name longer than the column allows', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: userId });

      await assert.rejects(
        repository().update(challengeId, { name: 'x'.repeat(101) }),
        rejectsWith('invalid-input'),
      );
    });
  });

  describe('setStatus', () => {
    test('moves the challenge forward', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: userId });

      await repository().setStatus(challengeId, 'active');

      assert.equal((await repository().get(challengeId)).status, 'active');
    });

    test('rejects a challenge that is gone', async () => {
      await assert.rejects(
        repository().setStatus(ABSENT_ID, 'active'),
        rejectsWith('not-found'),
      );
    });
  });

  describe('remove', () => {
    test('cascades the tags, memberships and join code', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });
      await seedTag(pool, { challengeId });

      await repository().remove(challengeId);

      for (const table of ['tags', 'memberships', 'join_codes']) {
        const { rowCount } = await pool.query(`select 1 from ${table}`);
        assert.equal(rowCount, 0, `${table} should have cascaded`);
      }
    });

    test('leaves the global users and books alone', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      await seedBook(pool, { createdBy: userId });
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });

      await repository().remove(challengeId);

      assert.equal((await pool.query('select 1 from users')).rowCount, 1);
      assert.equal((await pool.query('select 1 from books')).rowCount, 1);
    });

    test('refuses a challenge holding an untagged reading', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const bookId = await seedBook(pool);
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });
      await seedReading(pool, { challengeId, userId, bookId });

      await assert.rejects(
        repository().remove(challengeId),
        rejectsWith('conflict'),
      );
      assert.equal((await pool.query('select 1 from challenges')).rowCount, 1);
      assert.equal((await pool.query('select 1 from readings')).rowCount, 1);
    });

    test('refuses a challenge holding a tagged reading', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const bookId = await seedBook(pool);
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });
      const tagId = await seedTag(pool, { challengeId });
      const readingId = await seedReading(pool, {
        challengeId,
        userId,
        bookId,
      });
      await seedReadingTag(pool, { readingId, tagId, challengeId });

      await assert.rejects(
        repository().remove(challengeId),
        rejectsWith('conflict'),
      );
      assert.equal(
        (await pool.query('select 1 from reading_tags')).rowCount,
        1,
      );
    });

    test('refuses a challenge holding only a reading list entry', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const bookId = await seedBook(pool);
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });
      await seedTbrEntry(pool, { challengeId, userId, bookId });

      await assert.rejects(
        repository().remove(challengeId),
        rejectsWith('conflict'),
      );
      assert.equal((await pool.query('select 1 from tbr_entries')).rowCount, 1);
    });

    test('reports both counts in the error details', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const bookId = await seedBook(pool);
      const { challengeId } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });
      await seedReading(pool, { challengeId, userId, bookId });
      await seedReading(pool, { challengeId, userId, bookId });
      await seedTbrEntry(pool, { challengeId, userId, bookId });

      await assert.rejects(repository().remove(challengeId), (error) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.kind, 'conflict');
        assert.deepEqual(error.details, {
          challengeId,
          readings: 2,
          tbrEntries: 1,
        });
        return true;
      });
    });

    test('rejects a challenge that is already gone', async () => {
      await assert.rejects(
        repository().remove(ABSENT_ID),
        rejectsWith('not-found'),
      );
    });
  });

  describe('getMembership', () => {
    test('returns a non-active membership too, for the guard to reject', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const left = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });
      await seedMembership(pool, {
        challengeId,
        userId: left,
        status: 'left',
        role: 'member',
      });

      const membership = await repository().getMembership(challengeId, left);

      assert.equal(membership?.status, 'left');
      assert.ok(membership?.joinedAt instanceof Date);
    });

    test('returns undefined when there is no row', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });

      assert.equal(
        await repository().getMembership(challengeId, 'nobody'),
        undefined,
      );
    });

    test('reports a malformed challenge id as no membership', async () => {
      assert.equal(
        await repository().getMembership('not-a-uuid', 'nobody'),
        undefined,
      );
    });
  });

  describe('listMembers', () => {
    test('returns every membership, including those who left', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool, { name: 'Ada' });
      const member = await seedUser(pool, { name: 'Bela' });
      const challengeId = await seedChallenge(pool, { createdBy: owner });
      await seedMembership(pool, { challengeId, userId: owner, role: 'owner' });
      await seedMembership(pool, {
        challengeId,
        userId: member,
        status: 'removed',
      });

      const members = await repository().listMembers(challengeId);

      assert.deepEqual(
        members.map((m) => [m.userId, m.role, m.status]),
        [
          [owner, 'owner', 'active'],
          [member, 'member', 'removed'],
        ],
      );
    });

    test('excludes members of other challenges', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const mine = await seedChallenge(pool, { createdBy: owner });
      const theirs = await seedChallenge(pool, { createdBy: owner });
      await seedMembership(pool, { challengeId: mine, userId: owner });
      await seedMembership(pool, { challengeId: theirs, userId: owner });

      assert.equal((await repository().listMembers(mine)).length, 1);
    });

    test('reports a malformed id as not found rather than failing', async () => {
      await assert.rejects(repository().listMembers('not-a-uuid'), {
        kind: 'not-found',
      });
    });
  });

  describe('listActiveMemberships', () => {
    test('keys one user’s active memberships by challenge', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const first = await seedChallenge(pool, { createdBy: userId });
      const second = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, {
        challengeId: first,
        userId,
        role: 'owner',
      });
      await seedMembership(pool, { challengeId: second, userId });

      const byChallenge = await repository().listActiveMemberships(userId);

      assert.deepEqual([...byChallenge.keys()].sort(), [first, second].sort());
      assert.equal(byChallenge.get(first)?.role, 'owner');
    });

    test('omits memberships that are not active', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const left = await seedChallenge(pool, { createdBy: userId });
      const removed = await seedChallenge(pool, { createdBy: userId });
      await seedMembership(pool, { challengeId: left, userId, status: 'left' });
      await seedMembership(pool, {
        challengeId: removed,
        userId,
        status: 'removed',
      });

      assert.equal((await repository().listActiveMemberships(userId)).size, 0);
    });

    test('omits other people’s memberships', async () => {
      const pool = testDb.db;
      const mine = await seedUser(pool);
      const theirs = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: mine });
      await seedMembership(pool, { challengeId, userId: theirs });

      assert.equal((await repository().listActiveMemberships(mine)).size, 0);
    });
  });

  describe('upsertMembership', () => {
    test('inserts a membership that does not exist', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const joiner = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });

      await repository().upsertMembership(challengeId, joiner, {
        role: 'member',
        status: 'active',
      });

      assert.equal(
        (await repository().getMembership(challengeId, joiner))?.status,
        'active',
      );
    });

    test('changes the role and status of an existing membership', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const member = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });
      await seedMembership(pool, { challengeId, userId: member });

      await repository().upsertMembership(challengeId, member, {
        role: 'admin',
        status: 'active',
      });

      const membership = await repository().getMembership(challengeId, member);
      assert.equal(membership?.role, 'admin');

      const { rows } = await pool.query<{ updated_at: Date | null }>(
        'select updated_at from memberships where challenge_id = $1 and user_id = $2',
        [challengeId, member],
      );
      assert.ok(rows[0]?.updated_at instanceof Date);
    });

    test('keeps the original joined_at when a member rejoins', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const member = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });
      await seedMembership(pool, {
        challengeId,
        userId: member,
        status: 'left',
      });
      const joinedAt = (await repository().getMembership(challengeId, member))
        ?.joinedAt;

      await repository().upsertMembership(challengeId, member, {
        role: 'member',
        status: 'active',
      });

      assert.deepEqual(
        (await repository().getMembership(challengeId, member))?.joinedAt,
        joinedAt,
      );
    });

    test('rejects a user who does not exist', async () => {
      const pool = testDb.db;
      const owner = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: owner });

      await assert.rejects(
        repository().upsertMembership(challengeId, 'nobody', {
          role: 'member',
          status: 'active',
        }),
        rejectsWith('not-found'),
      );
    });

    test('rejects a challenge that does not exist', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);

      await assert.rejects(
        repository().upsertMembership(ABSENT_ID, userId, {
          role: 'member',
          status: 'active',
        }),
        rejectsWith('not-found'),
      );
    });
  });

  describe('listActiveOwners', () => {
    test('returns only the active owners', async () => {
      const pool = testDb.db;
      const first = await seedUser(pool);
      const second = await seedUser(pool);
      const third = await seedUser(pool);
      const challengeId = await seedChallenge(pool, { createdBy: first });
      await seedMembership(pool, { challengeId, userId: first, role: 'owner' });
      await seedMembership(pool, {
        challengeId,
        userId: second,
        role: 'owner',
        status: 'left',
      });
      await seedMembership(pool, { challengeId, userId: third, role: 'admin' });

      const owners = await inTransaction(testDb.db, (client) =>
        challengeRepository(client).listActiveOwners(challengeId),
      );

      assert.deepEqual(owners, [first]);
    });

    test('reports a malformed id as not found rather than failing', async () => {
      await assert.rejects(
        inTransaction(testDb.db, (client) =>
          challengeRepository(client).listActiveOwners('not-a-uuid'),
        ),
        { kind: 'not-found' },
      );
    });
  });

  describe('join codes', () => {
    test('findByJoinCode resolves the challenge the code belongs to', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const { challengeId, joinCode } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });

      assert.deepEqual(await repository().findByJoinCode(joinCode), {
        challengeId,
      });
    });

    test('findByJoinCode returns undefined for a code nobody holds', async () => {
      assert.equal(await repository().findByJoinCode('ABCDEFGH'), undefined);
    });

    test('getJoinCode returns the live code', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const { challengeId, joinCode } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });

      assert.equal(await repository().getJoinCode(challengeId), joinCode);
    });

    test('rotate replaces the code, leaving exactly one live row', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);
      const { challengeId, joinCode } = await repository().create(userId, {
        name: 'Summer',
        tagCap: 3,
      });

      const rotated = await repository().rotateJoinCode(challengeId, userId);

      assert.notEqual(rotated, joinCode);
      assert.equal(await repository().findByJoinCode(joinCode), undefined);
      assert.deepEqual(await repository().findByJoinCode(rotated), {
        challengeId,
      });
      const { rowCount } = await pool.query(
        'select 1 from join_codes where challenge_id = $1',
        [challengeId],
      );
      assert.equal(rowCount, 1);
    });

    test('rotate rejects a challenge that is gone', async () => {
      const pool = testDb.db;
      const userId = await seedUser(pool);

      await assert.rejects(
        repository().rotateJoinCode(ABSENT_ID, userId),
        rejectsWith('not-found'),
      );
    });
  });
});
