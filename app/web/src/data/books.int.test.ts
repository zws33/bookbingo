/**
 * Integration tests for getOrCreateBook against the Firestore emulator.
 *
 * Requires the Firebase emulator to be running:
 *   pnpm --filter @bookbingo/web emulator:start
 *
 * Run with:
 *   pnpm --filter @bookbingo/web test:integration
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { deriveBookId } from '@bookbingo/lib-core';
import { db, auth } from '../lib/firebase';
import { getOrCreateBook } from './books';

// A fresh anonymous user per run keeps writes isolated from other suites.
let TEST_USER_ID: string;
// Ids written during a test, torn down afterward.
const createdBookIds: string[] = [];

beforeAll(async () => {
  const cred = await signInAnonymously(auth);
  TEST_USER_ID = cred.user.uid;
});

afterEach(async () => {
  await Promise.all(
    createdBookIds.map((id) => deleteDoc(doc(db, 'books', id)).catch(() => {})),
  );
  createdBookIds.length = 0;
});

describe('getOrCreateBook integration (emulator)', () => {
  it('writes the book document under a deterministic, hash-derived id', async () => {
    const title = 'The Left Hand of Darkness';
    const author = 'Ursula K. Le Guin';

    const bookId = await getOrCreateBook(title, author, TEST_USER_ID);
    createdBookIds.push(bookId);

    // Manual books get a deterministic, hash-derived id from title/author.
    expect(bookId).toBe(deriveBookId({ title, author }));

    const snap = await getDoc(doc(db, 'books', bookId));
    expect(snap.exists()).toBe(true);
    const data = snap.data()!;
    expect(data.title).toBe(title);
    expect(data.author).toBe(author);
    expect(data.createdBy).toBe(TEST_USER_ID);
    expect(data.createdAt).toBeTruthy();
    // Legacy normalization fields are gone; manual books carry no externalIds.
    expect(data.titleLower).toBeUndefined();
    expect(data.authorLower).toBeUndefined();
    expect(data.externalIds).toBeUndefined();
  });

  it('is idempotent — same identity returns the same id', async () => {
    const first = await getOrCreateBook('Dune', 'Frank Herbert', TEST_USER_ID);
    createdBookIds.push(first);
    const second = await getOrCreateBook(
      '  dune ',
      'frank  herbert',
      TEST_USER_ID,
    );

    // Case/whitespace variants normalize to the same deterministic id.
    expect(second).toBe(first);
  });
});
