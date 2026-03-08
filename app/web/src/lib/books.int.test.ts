/**
 * Integration tests for books.ts CRUD functions.
 *
 * Requires the Firebase emulator to be running:
 *   pnpm --filter @bookbingo/web emulator:start
 *
 * Run with:
 *   pnpm --filter @bookbingo/web test:integration
 */
import { describe, it, expect, afterEach } from 'vitest';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createReading, updateReading, deleteReading } from './books';

// Each test uses a unique userId to avoid cross-test interference
let createdReadingId: string | null = null;
const TEST_USER_ID = `test-user-int-${Date.now()}`;

afterEach(async () => {
  if (createdReadingId) {
    await deleteDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId)).catch(() => {});
    createdReadingId = null;
  }
});

describe('books integration (emulator)', () => {
  it('createReading writes correct fields to Firestore', async () => {
    createdReadingId = await createReading(
      TEST_USER_ID,
      'The Left Hand of Darkness',
      'Ursula K. Le Guin',
      ['sci-fi'],
      false,
    );

    expect(createdReadingId).toBeTruthy();

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    expect(snap.exists()).toBe(true);
    const data = snap.data()!;
    expect(data.bookTitle).toBe('The Left Hand of Darkness');
    expect(data.bookAuthor).toBe('Ursula K. Le Guin');
    expect(data.tiles).toEqual(['sci-fi']);
    expect(data.isFreebie).toBe(false);
    expect(data.createdAt).toBeTruthy();
  });

  it('updateReading updates title, author, tiles, and sets updatedAt', async () => {
    createdReadingId = await createReading(
      TEST_USER_ID,
      'Old Title',
      'Old Author',
      ['mystery'],
      false,
    );

    await updateReading(TEST_USER_ID, createdReadingId, 'New Title', 'New Author', ['sci-fi'], true);

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    const data = snap.data()!;
    expect(data.bookTitle).toBe('New Title');
    expect(data.bookAuthor).toBe('New Author');
    expect(data.tiles).toEqual(['sci-fi']);
    expect(data.isFreebie).toBe(true);
    expect(data.updatedAt).toBeTruthy();
  });

  it('deleteReading removes the document', async () => {
    createdReadingId = await createReading(
      TEST_USER_ID,
      'To Be Deleted',
      'Some Author',
      [],
      false,
    );

    await deleteReading(TEST_USER_ID, createdReadingId);

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    expect(snap.exists()).toBe(false);
    createdReadingId = null; // already deleted, skip afterEach cleanup
  });
});
