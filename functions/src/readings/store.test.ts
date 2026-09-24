import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { toReading } from './store.js';
import { TILES } from '../domain/constants.js';

const [t1] = TILES.map((tile) => tile.id);
const READ_AT = new Date('2026-01-02T03:04:05.000Z');

function makeDoc(id: string, data: unknown): QueryDocumentSnapshot {
  return {
    id,
    ref: { path: `users/user-1/readings/${id}` },
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

const timestamp = (date: Date) => ({ toDate: () => date });

describe('toReading', () => {
  test('keeps instants as Dates for the presenter to encode', () => {
    const reading = toReading(
      makeDoc('r1', {
        bookId: 'book-1',
        tiles: [t1],
        isFreebie: false,
        readAt: timestamp(READ_AT),
        createdAt: timestamp(READ_AT),
      }),
    );
    assert.deepEqual(reading.readAt, READ_AT);
    assert.equal(reading.updatedAt, undefined);
  });

  // Readings written before bookId existed still carry bookTitle/bookAuthor.
  // They resolve through bookId, so the book document is the only source.
  test('ignores the stale denormalized title and author', () => {
    const reading = toReading(
      makeDoc('r1', {
        bookId: 'book-1',
        bookTitle: 'Stale Title',
        bookAuthor: 'Stale Author',
        tiles: [],
        isFreebie: false,
        readAt: timestamp(READ_AT),
        createdAt: timestamp(READ_AT),
      }),
    );
    assert.deepEqual(Object.keys(reading).sort(), [
      'bookId',
      'createdAt',
      'id',
      'isFreebie',
      'readAt',
      'tiles',
    ]);
  });
});
