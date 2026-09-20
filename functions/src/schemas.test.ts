import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  BookDocSchema,
  ReadingDocSchema,
  UserProfileDocSchema,
  mapValid,
} from './schemas.js';

const READ_AT = new Date('2026-01-02T03:04:05Z');

/** Stands in for an admin Timestamp: `toDate()` is all the schemas require. */
const timestamp = (date: Date) => ({ toDate: () => date });

function makeDoc(id: string, data: unknown): QueryDocumentSnapshot {
  return {
    id,
    ref: { path: `books/${id}` },
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('BookDocSchema', () => {
  test('defaults metadata when the document has none', () => {
    const parsed = BookDocSchema.parse({ title: 'Dune', author: 'Herbert' });
    assert.deepEqual(parsed.metadata.categories, []);
    assert.equal(parsed.metadata.pageCount, null);
  });

  test('keeps valid fields when one metadata field is invalid', () => {
    const parsed = BookDocSchema.parse({
      title: 'Dune',
      author: 'Herbert',
      metadata: {
        pageCount: 412,
        publishedDate: null,
        categories: ['scifi'],
        language: 'en',
        isbn: null,
        thumbnailUrl: '',
      },
    });
    assert.equal(parsed.metadata.pageCount, 412);
    assert.deepEqual(parsed.metadata.categories, ['scifi']);
    assert.equal(parsed.metadata.thumbnailUrl, null);
  });

  // Per-field recovery only covers a key that is present and invalid. An
  // absent key fails the object, and the object-level catch replaces the whole
  // struct — so a document written before a metadata field existed reads back
  // with every field empty. Pinned as the client's current behavior, which
  // this copy has to match; changing it is a separate decision.
  test('falls back to empty metadata when a key is absent', () => {
    const parsed = BookDocSchema.parse({
      title: 'Dune',
      author: 'Herbert',
      metadata: { pageCount: 412 },
    });
    assert.equal(parsed.metadata.pageCount, null);
  });

  test('does not share the recovered categories array between documents', () => {
    const first = BookDocSchema.parse({ title: 'A', author: 'B' });
    const second = BookDocSchema.parse({ title: 'C', author: 'D' });
    first.metadata.categories.push('scifi');
    assert.deepEqual(second.metadata.categories, []);
  });
});

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

describe('UserProfileDocSchema', () => {
  test('replaces a stored null name with the fallback', () => {
    assert.equal(UserProfileDocSchema.parse({ name: null }).name, 'User');
  });
});

describe('mapValid', () => {
  test('drops invalid documents and keeps the rest', () => {
    const docs = [
      makeDoc('good', { title: 'Dune', author: 'Herbert' }),
      makeDoc('bad', { title: 42 }),
      makeDoc('good-2', { title: 'Emma', author: 'Austen' }),
    ];

    const titles = mapValid('books', docs, (doc) => {
      return BookDocSchema.parse(doc.data()).title;
    });

    assert.deepEqual(titles, ['Dune', 'Emma']);
  });
});
