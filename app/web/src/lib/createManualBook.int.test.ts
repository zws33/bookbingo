/**
 * Integration tests for the createManualBook callable against the emulators.
 *
 * Run with: pnpm run test:integration.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { BookMetadata } from '@bookbingo/lib-types';
import {
  adminDb,
  closeAdminApp,
  deleteDocs,
  signInTestUser,
  signOutTestUser,
} from '../testing/int';
import { createManualBook } from './createManualBook';

function makeMetadata(): BookMetadata {
  return {
    pageCount: 412,
    publishedDate: '1965',
    isbn: '9780441172719',
    language: 'en',
    thumbnailUrl: 'https://example.com/dune.jpg',
    categories: ['Science Fiction'],
  };
}

const createdBookIds: string[] = [];

beforeAll(async () => {
  await signInTestUser();
});

afterEach(async () => {
  await deleteDocs(createdBookIds.map((id) => `books/${id}`));
  createdBookIds.length = 0;
});

afterAll(async () => {
  await signOutTestUser();
  await closeAdminApp();
});

describe.sequential('createManualBook integration (emulator)', () => {
  it('rejects a whitespace-only title', async () => {
    await expect(
      createManualBook('   ', 'Frank Herbert', makeMetadata()),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('returns the created book and stores it trimmed', async () => {
    const book = await createManualBook(
      '  The Left Hand of Darkness  ',
      '  Ursula K. Le Guin  ',
      {
        pageCount: 304,
        publishedDate: ' 1969 ',
        isbn: ' 9780441478125 ',
        language: ' en ',
        thumbnailUrl: 'https://example.com/left-hand.jpg',
        categories: [' Science Fiction ', ' Classics '],
      },
    );
    createdBookIds.push(book.id);

    expect(book).toMatchObject({
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
    });
    expect(book.metadata.pageCount).toBe(304);

    // Verified through the Admin SDK: once the security rules are locked, the
    // client has no way to read /books directly.
    const stored = await adminDb().doc(`books/${book.id}`).get();
    expect(stored.exists).toBe(true);
    expect(stored.data()).toMatchObject({
      title: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      metadata: {
        pageCount: 304,
        publishedDate: '1969',
        isbn: '9780441478125',
        language: 'en',
        categories: ['Science Fiction', 'Classics'],
      },
    });
  });

  it('returns the existing book for a case variant without overwriting it', async () => {
    const first = await createManualBook(
      'Les Misérables',
      'Victor Hugo',
      makeMetadata(),
    );
    createdBookIds.push(first.id);

    const second = await createManualBook('les miserables', 'victor  hugo!', {
      ...makeMetadata(),
      pageCount: 1,
    });

    expect(second.id).toBe(first.id);

    const stored = await adminDb().doc(`books/${first.id}`).get();
    expect(stored.data()).toMatchObject({
      title: 'Les Misérables',
      author: 'Victor Hugo',
      metadata: { pageCount: 412 },
    });
  });
});
