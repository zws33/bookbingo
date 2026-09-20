import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  canAssignTile,
  validateBookTiles,
  validateFreebie,
  MAX_TILES_PER_BOOK,
} from './validation.js';
import type { ScoringInput } from '@bookbingo/lib-types';

test('Validation Core', async (t) => {
  await t.test('canAssignTile', async (t) => {
    const input: ScoringInput = {
      tiles: ['t01', 't02'],
      isFreebie: false,
    };

    await t.test('should return true for a valid tile assignment', () => {
      assert.ok(canAssignTile(input, 't03'));
    });

    await t.test(
      'should return false if the book has reached the tile limit',
      () => {
        const full: ScoringInput = { ...input, tiles: ['t01', 't02', 't03'] };
        assert.equal(canAssignTile(full, 't04'), false);
      },
    );

    await t.test(
      'should return true if the book is a freebie, even if the tile limit is reached',
      () => {
        const freebie: ScoringInput = {
          ...input,
          tiles: ['t01', 't02', 't03'],
          isFreebie: true,
        };
        assert.ok(canAssignTile(freebie, 't04'));
      },
    );

    await t.test(
      'should return false if the tile is already assigned to the book',
      () => {
        assert.equal(canAssignTile(input, 't01'), false);
      },
    );

    await t.test('should return false for a non-existent tile', () => {
      assert.equal(canAssignTile(input, 't99'), false);
    });
  });

  await t.test('validateBookTiles', async (t) => {
    await t.test('should not throw an error for a valid book', () => {
      const valid: ScoringInput = {
        tiles: ['t01', 't02'],
        isFreebie: false,
      };
      assert.doesNotThrow(() => validateBookTiles(valid));
    });

    await t.test(
      'should throw an error if a book exceeds the tile limit',
      () => {
        const invalid: ScoringInput = {
          tiles: ['t01', 't02', 't03', 't04'],
          isFreebie: false,
        };
        assert.throws(
          () => validateBookTiles(invalid),
          new RegExp(`exceeds the maximum of ${MAX_TILES_PER_BOOK} tiles`),
        );
      },
    );

    await t.test(
      'should not throw an error for a freebie book that exceeds the tile limit',
      () => {
        const freebie: ScoringInput = {
          tiles: ['t01', 't02', 't03', 't04'],
          isFreebie: true,
        };
        assert.doesNotThrow(() => validateBookTiles(freebie));
      },
    );

    await t.test('should throw an error if a book has duplicate tiles', () => {
      const invalid: ScoringInput = {
        tiles: ['t01', 't01'],
        isFreebie: false,
      };
      assert.throws(
        () => validateBookTiles(invalid),
        /has duplicate tile assignments/,
      );
    });
  });

  await t.test('validateFreebie', async (t) => {
    await t.test(
      'should not throw an error if there is one or zero freebies',
      () => {
        const noFreebies: ScoringInput[] = [
          { tiles: [], isFreebie: false },
          { tiles: [], isFreebie: false },
        ];
        const oneFreebie: ScoringInput[] = [
          { tiles: [], isFreebie: true },
          { tiles: [], isFreebie: false },
        ];
        assert.doesNotThrow(() => validateFreebie(noFreebies));
        assert.doesNotThrow(() => validateFreebie(oneFreebie));
      },
    );

    await t.test(
      'should throw an error if there is more than one freebie',
      () => {
        const twoFreebies: ScoringInput[] = [
          { tiles: [], isFreebie: true },
          { tiles: [], isFreebie: true },
        ];
        assert.throws(
          () => validateFreebie(twoFreebies),
          /more than one "freebie" book/,
        );
      },
    );
  });
});
