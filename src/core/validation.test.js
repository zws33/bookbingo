
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canAssignTile, validateBookTiles, validateFreebie, MAX_TILES_PER_BOOK } from './validation.js';

test('Validation Core', async (t) => {
  await t.test('canAssignTile', async (t) => {
    const book = {
      id: '1',
      userId: 'user1',
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      tiles: ['t01', 't02'],
      isFreebie: false,
      readAt: new Date(),
    };

    await t.test('should return true for a valid tile assignment', () => {
      assert.ok(canAssignTile(book, 't03'));
    });

    await t.test('should return false if the book has reached the tile limit', () => {
      const fullBook = { ...book, tiles: ['t01', 't02', 't03'] };
      assert.equal(canAssignTile(fullBook, 't04'), false);
    });

    await t.test('should return true if the book is a freebie, even if the tile limit is reached', () => {
      const freebieBook = { ...book, tiles: ['t01', 't02', 't03'], isFreebie: true };
      assert.ok(canAssignTile(freebieBook, 't04'));
    });

    await t.test('should return false if the tile is already assigned to the book', () => {
      assert.equal(canAssignTile(book, 't01'), false);
    });

    await t.test('should return false for a manual tile', () => {
      assert.equal(canAssignTile(book, 'm01'), false);
    });

    await t.test('should return false for a non-existent tile', () => {
      assert.equal(canAssignTile(book, 't99'), false);
    });
  });

  await t.test('validateBookTiles', async (t) => {
    await t.test('should not throw an error for a valid book', () => {
      const validBook = { title: 'Valid Book', tiles: ['t01', 't02'], isFreebie: false };
      assert.doesNotThrow(() => validateBookTiles(validBook));
    });

    await t.test('should throw an error if a book exceeds the tile limit', () => {
      const invalidBook = { title: 'Invalid Book', tiles: ['t01', 't02', 't03', 't04'], isFreebie: false };
      assert.throws(() => validateBookTiles(invalidBook), new RegExp(`exceeds the maximum of ${MAX_TILES_PER_BOOK} tiles`));
    });

    await t.test('should not throw an error for a freebie book that exceeds the tile limit', () => {
      const freebieBook = { title: 'Freebie Book', tiles: ['t01', 't02', 't03', 't04'], isFreebie: true };
      assert.doesNotThrow(() => validateBookTiles(freebieBook));
    });

    await t.test('should throw an error if a book has duplicate tiles', () => {
      const invalidBook = { title: 'Invalid Book', tiles: ['t01', 't01'], isFreebie: false };
      assert.throws(() => validateBookTiles(invalidBook), /has duplicate tile assignments/);
    });
  });

  await t.test('validateFreebie', async (t) => {
    await t.test('should not throw an error if there is one or zero freebies', () => {
      const noFreebies = [{ isFreebie: false }, { isFreebie: false }];
      const oneFreebie = [{ isFreebie: true }, { isFreebie: false }];
      assert.doesNotThrow(() => validateFreebie(noFreebies));
      assert.doesNotThrow(() => validateFreebie(oneFreebie));
    });

    await t.test('should throw an error if there is more than one freebie', () => {
      const twoFreebies = [{ isFreebie: true }, { isFreebie: true }];
      assert.throws(() => validateFreebie(twoFreebies), /more than one "freebie" book/);
    });
  });
});
