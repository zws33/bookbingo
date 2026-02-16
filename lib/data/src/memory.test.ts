import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memory } from './memory.js';

test('Memory Data Store', async (t) => {
  await t.test('Users', async (t) => {
    await t.test(
      'createUser returns user with id, name, and createdAt',
      async () => {
        memory._reset();
        const user = await memory.createUser('alice');

        assert.ok(user.id, 'user should have an id');
        assert.equal(user.name, 'alice');
        assert.ok(user.createdAt instanceof Date, 'createdAt should be a Date');
      },
    );

    await t.test('getAllUsers returns all created users', async () => {
      memory._reset();
      await memory.createUser('alice');
      await memory.createUser('bob');

      const users = await memory.getAllUsers();

      assert.equal(users.length, 2);
      assert.ok(users.some((u) => u.name === 'alice'));
      assert.ok(users.some((u) => u.name === 'bob'));
    });

    await t.test('getUserById returns the correct user', async () => {
      memory._reset();
      const created = await memory.createUser('alice');

      const found = await memory.getUserById(created.id);

      assert.deepEqual(found, created);
    });

    await t.test('getUserById returns undefined for unknown id', async () => {
      memory._reset();

      const found = await memory.getUserById('nonexistent-id');

      assert.equal(found, undefined);
    });
  });

  await t.test('Books', async (t) => {
    await t.test('createBook returns book with generated id', async () => {
      memory._reset();
      const user = await memory.createUser('alice');

      const book = await memory.createBook({
        userId: user.id,
        title: 'The Hobbit',
        author: 'J.R.R. Tolkien',
        tiles: ['t01', 't02'],
        isFreebie: false,
        readAt: new Date(),
      });

      assert.ok(book.id, 'book should have an id');
      assert.equal(book.title, 'The Hobbit');
      assert.equal(book.author, 'J.R.R. Tolkien');
      assert.deepEqual(book.tiles, ['t01', 't02']);
      assert.equal(book.isFreebie, false);
      assert.equal(book.userId, user.id);
    });

    await t.test(
      "getBooksByUserId returns only that user's books",
      async () => {
        memory._reset();
        const alice = await memory.createUser('alice');
        const bob = await memory.createUser('bob');

        await memory.createBook({
          userId: alice.id,
          title: 'Alice Book 1',
          author: 'Author',
          tiles: [],
          isFreebie: false,
          readAt: new Date(),
        });
        await memory.createBook({
          userId: bob.id,
          title: 'Bob Book 1',
          author: 'Author',
          tiles: [],
          isFreebie: false,
          readAt: new Date(),
        });
        await memory.createBook({
          userId: alice.id,
          title: 'Alice Book 2',
          author: 'Author',
          tiles: [],
          isFreebie: false,
          readAt: new Date(),
        });

        const aliceBooks = await memory.getBooksByUserId(alice.id);
        const bobBooks = await memory.getBooksByUserId(bob.id);

        assert.equal(aliceBooks.length, 2);
        assert.equal(bobBooks.length, 1);
        assert.ok(aliceBooks.every((b) => b.userId === alice.id));
        assert.ok(bobBooks.every((b) => b.userId === bob.id));
      },
    );

    await t.test(
      'getBooksByUserId returns empty array for user with no books',
      async () => {
        memory._reset();
        const user = await memory.createUser('alice');

        const books = await memory.getBooksByUserId(user.id);

        assert.deepEqual(books, []);
      },
    );
  });
});
