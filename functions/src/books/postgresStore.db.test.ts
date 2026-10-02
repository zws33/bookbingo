import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../common/errors.js';
import { inTransaction } from '../db/transaction.js';
import { connectTestDatabase, type TestDatabase } from '../testing/db.js';
import { seedBook, seedUser } from '../testing/factories.js';
import { MissingBookError } from './errors.js';
import { bookRepository } from './postgresStore.js';

const OPEN_LIBRARY = 'openLibrary';

/** A derived id: 32 hex characters, as the check constraint requires. */
const bookId = (seed: string) => seed.repeat(32).slice(0, 32);

describe('bookRepository', () => {
  let testDb: TestDatabase;

  before(async () => {
    testDb = await connectTestDatabase();
  });
  beforeEach(() => testDb.reset());
  after(() => testDb.close());

  const repository = () => bookRepository(testDb.db);

  describe('getByIds', () => {
    test('returns an empty map for no ids', async () => {
      assert.deepEqual(await repository().getByIds([]), new Map());
    });

    test('keys each book by its id', async () => {
      const pool = testDb.db;
      const first = await seedBook(pool, { title: 'Dune', author: 'Herbert' });
      const second = await seedBook(pool, { title: 'Ubik', author: 'Dick' });

      const found = await repository().getByIds([first, second]);

      assert.equal(found.size, 2);
      assert.deepEqual(found.get(first), {
        id: first,
        title: 'Dune',
        author: 'Herbert',
        thumbnailUrl: null,
      });
      assert.equal(found.get(second)?.title, 'Ubik');
    });

    test('resolves a repeated id once', async () => {
      const id = await seedBook(testDb.db);

      const found = await repository().getByIds([id, id, id]);

      assert.equal(found.size, 1);
    });

    test('returns the stored thumbnail', async () => {
      const id = await seedBook(testDb.db, {
        thumbnailUrl: 'https://example.com/cover.jpg',
      });

      assert.equal(
        (await repository().getByIds([id])).get(id)?.thumbnailUrl,
        'https://example.com/cover.jpg',
      );
    });

    test('names every unresolved id at once', async () => {
      const id = await seedBook(testDb.db);
      const missingA = bookId('a');
      const missingB = bookId('b');

      await assert.rejects(
        repository().getByIds([id, missingA, missingB]),
        (error: unknown) => {
          assert.ok(error instanceof MissingBookError);
          assert.deepEqual(error.bookIds.sort(), [missingA, missingB].sort());
          assert.equal(error.kind, 'corrupt');
          return true;
        },
      );
    });
  });

  describe('findByExternalRef', () => {
    test('returns the book an external id points at', async () => {
      const pool = testDb.db;
      const id = await seedBook(pool, { title: 'Dune' });
      await pool.query(
        `insert into book_external_refs (book_id, source, external_id)
         values ($1, $2, $3)`,
        [id, OPEN_LIBRARY, '/works/OL1W'],
      );

      const found = await repository().findByExternalRef(
        OPEN_LIBRARY,
        '/works/OL1W',
      );

      assert.equal(found?.id, id);
      assert.equal(found?.title, 'Dune');
    });

    test('returns undefined for an external id nothing points at', async () => {
      assert.equal(
        await repository().findByExternalRef(OPEN_LIBRARY, '/works/OL404W'),
        undefined,
      );
    });
  });

  describe('createIfAbsent', () => {
    const dune = {
      id: bookId('d'),
      title: 'Dune',
      author: 'Frank Herbert',
      thumbnailUrl: null,
      createdBy: null,
    };

    test('inserts the book and reports it created', async () => {
      const written = await repository().createIfAbsent(dune);

      assert.deepEqual(written, { bookId: dune.id, created: true });
      assert.equal(
        (await repository().getByIds([dune.id])).get(dune.id)?.title,
        'Dune',
      );
    });

    test('leaves an existing book untouched and reports it was not created', async () => {
      await repository().createIfAbsent(dune);

      const written = await repository().createIfAbsent({
        ...dune,
        title: 'Dune (revised)',
      });

      assert.deepEqual(written, { bookId: dune.id, created: false });
      assert.equal(
        (await repository().getByIds([dune.id])).get(dune.id)?.title,
        'Dune',
      );
    });

    test('records the manual creator', async () => {
      const userId = await seedUser(testDb.db);

      await repository().createIfAbsent({ ...dune, createdBy: userId });

      const { rows } = await testDb.db.query<{ created_by: string | null }>(
        'select created_by from books where id = $1',
        [dune.id],
      );
      assert.equal(rows[0]?.created_by, userId);
    });

    test('inserts the external refs alongside the book', async () => {
      await repository().createIfAbsent(dune, [
        {
          source: OPEN_LIBRARY,
          externalId: '/works/OL1W',
          details: { coverId: 42 },
        },
        { source: OPEN_LIBRARY, externalId: '/books/OL2M', details: {} },
      ]);

      const { rows } = await testDb.db.query<{
        external_id: string;
        details: Record<string, unknown>;
      }>(
        'select external_id, details from book_external_refs where book_id = $1 order by external_id',
        [dune.id],
      );
      assert.deepEqual(
        rows.map((row) => row.external_id),
        ['/books/OL2M', '/works/OL1W'],
      );
      assert.deepEqual(rows[1]?.details, { coverId: 42 });
    });

    test('does not duplicate a ref the book already has', async () => {
      const ref = {
        source: OPEN_LIBRARY,
        externalId: '/works/OL1W',
        details: {},
      };
      await repository().createIfAbsent(dune, [ref]);

      await repository().createIfAbsent(dune, [ref]);

      const { rowCount } = await testDb.db.query(
        'select 1 from book_external_refs where book_id = $1',
        [dune.id],
      );
      assert.equal(rowCount, 1);
    });

    test('writes nothing when a ref insert fails', async () => {
      const pool = testDb.db;
      const other = await seedBook(pool);
      await pool.query(
        `insert into book_external_refs (book_id, source, external_id)
         values ($1, $2, $3)`,
        [other, OPEN_LIBRARY, '/works/OL1W'],
      );

      await assert.rejects(
        repository().createIfAbsent(dune, [
          { source: OPEN_LIBRARY, externalId: '/works/OL1W', details: {} },
        ]),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.kind, 'corrupt');
          return true;
        },
      );

      const { rowCount } = await pool.query(
        'select 1 from books where id = $1',
        [dune.id],
      );
      assert.equal(
        rowCount,
        0,
        'the book must not survive a failed ref insert',
      );
    });

    test('joins a transaction the caller already opened', async () => {
      await assert.rejects(
        inTransaction(testDb.db, async (client) => {
          await bookRepository(client).createIfAbsent(dune);
          throw new Error('caller rolled back');
        }),
        /caller rolled back/,
      );

      const { rowCount } = await testDb.db.query(
        'select 1 from books where id = $1',
        [dune.id],
      );
      assert.equal(rowCount, 0);
    });

    test('rejects a creator who does not exist', async () => {
      await assert.rejects(
        repository().createIfAbsent({ ...dune, createdBy: 'nobody' }),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.kind, 'not-found');
          return true;
        },
      );
    });

    test('rejects a blank title', async () => {
      await assert.rejects(
        repository().createIfAbsent({ ...dune, title: '   ' }),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.kind, 'invalid-input');
          return true;
        },
      );
    });
  });
});
