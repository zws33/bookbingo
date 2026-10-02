import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import { seedUser } from '../testing/factories.js';
import { userProfileRepository } from './postgresStore.js';

describe('userProfileRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => userProfileRepository(testDb.db);

  describe('get', () => {
    test('returns null for an id with no row', async () => {
      assert.equal(await repository().get('nobody'), null);
    });

    test('maps a row to its API shape', async () => {
      await testDb.db.query(
        'insert into users (id, name, photo_url) values ($1, $2, $3)',
        ['user-a', 'Ada', 'https://example.com/ada.png'],
      );

      assert.deepEqual(await repository().get('user-a'), {
        id: 'user-a',
        name: 'Ada',
        photoURL: 'https://example.com/ada.png',
      });
    });

    test('reports a missing photo as null rather than absent', async () => {
      await seedUser(testDb.db, { id: 'user-a', name: 'Ada' });

      const profile = await repository().get('user-a');

      assert.deepEqual(profile, { id: 'user-a', name: 'Ada', photoURL: null });
      assert.ok(profile && 'photoURL' in profile);
    });

    test('does not expose stored columns missing from the API type', async () => {
      await seedUser(testDb.db, { id: 'user-a' });

      const profile = await repository().get('user-a');

      assert.deepEqual(Object.keys(profile ?? {}).sort(), [
        'id',
        'name',
        'photoURL',
      ]);
    });
  });

  describe('list', () => {
    test('returns an empty array when there are no users', async () => {
      assert.deepEqual(await repository().list(), []);
    });

    test('returns every user ordered by name', async () => {
      const pool = testDb.db;
      await seedUser(pool, { id: 'user-c', name: 'Cleo' });
      await seedUser(pool, { id: 'user-a', name: 'Ada' });
      await seedUser(pool, { id: 'user-b', name: 'Bela' });

      assert.deepEqual(
        (await repository().list()).map((profile) => profile.name),
        ['Ada', 'Bela', 'Cleo'],
      );
    });
  });

  describe('upsert', () => {
    test('inserts a profile that does not exist yet', async () => {
      await repository().upsert({
        id: 'user-a',
        name: 'Ada',
        photoURL: 'https://example.com/ada.png',
      });

      assert.deepEqual(await repository().get('user-a'), {
        id: 'user-a',
        name: 'Ada',
        photoURL: 'https://example.com/ada.png',
      });
    });

    test('overwrites the name and photo of an existing profile', async () => {
      await seedUser(testDb.db, { id: 'user-a', name: 'Ada' });

      await repository().upsert({
        id: 'user-a',
        name: 'Ada Lovelace',
        photoURL: 'https://example.com/ada.png',
      });

      assert.deepEqual(await repository().get('user-a'), {
        id: 'user-a',
        name: 'Ada Lovelace',
        photoURL: 'https://example.com/ada.png',
      });
    });

    test('clears a stored photo when the profile no longer has one', async () => {
      await testDb.db.query(
        'insert into users (id, name, photo_url) values ($1, $2, $3)',
        ['user-a', 'Ada', 'https://example.com/ada.png'],
      );

      await repository().upsert({ id: 'user-a', name: 'Ada', photoURL: null });

      assert.equal((await repository().get('user-a'))?.photoURL, null);
    });

    test('stamps updated_at and leaves created_at alone', async () => {
      const pool = testDb.db;
      await seedUser(pool, { id: 'user-a', name: 'Ada' });
      const before = await pool.query<{
        created_at: Date;
        updated_at: Date | null;
      }>('select created_at, updated_at from users where id = $1', ['user-a']);
      assert.equal(before.rows[0]?.updated_at, null);

      await repository().upsert({ id: 'user-a', name: 'Ada', photoURL: null });

      const after = await pool.query<{
        created_at: Date;
        updated_at: Date | null;
      }>('select created_at, updated_at from users where id = $1', ['user-a']);
      assert.deepEqual(after.rows[0]?.created_at, before.rows[0]?.created_at);
      assert.ok(after.rows[0]?.updated_at instanceof Date);
    });
  });
});
