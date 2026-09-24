import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import z from 'zod/v4';
import { mapValid } from './firestoreHelpers.js';

function makeDoc(id: string, data: unknown): QueryDocumentSnapshot {
  return {
    id,
    ref: { path: `books/${id}` },
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

const TitledSchema = z.object({ title: z.string() });

describe('mapValid', () => {
  test('drops invalid documents and keeps the rest', () => {
    const docs = [
      makeDoc('good', { title: 'Dune' }),
      makeDoc('bad', { title: 42 }),
      makeDoc('good-2', { title: 'Emma' }),
    ];

    const titles = mapValid('books', docs, (doc) => {
      return TitledSchema.parse(doc.data()).title;
    });

    assert.deepEqual(titles, ['Dune', 'Emma']);
  });
});
