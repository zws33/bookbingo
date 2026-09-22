import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ReadingDocSchema } from './schema.js';

const READ_AT = new Date('2026-01-02T03:04:05Z');

/** Stands in for an admin Timestamp: `toDate()` is all the schema requires. */
const timestamp = (date: Date) => ({ toDate: () => date });

describe('ReadingDocSchema', () => {
  test('converts stored timestamps to dates', () => {
    const parsed = ReadingDocSchema.parse({
      bookId: 'book-1',
      tiles: ['t01'],
      isFreebie: false,
      readAt: timestamp(READ_AT),
      createdAt: timestamp(READ_AT),
    });
    assert.deepEqual(parsed.readAt, READ_AT);
    assert.equal(parsed.updatedAt, undefined);
  });

  test('rejects a reading with no bookId', () => {
    assert.throws(() =>
      ReadingDocSchema.parse({
        bookId: '',
        tiles: [],
        isFreebie: false,
        readAt: timestamp(READ_AT),
        createdAt: timestamp(READ_AT),
      }),
    );
  });
});
