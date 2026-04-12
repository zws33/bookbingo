/**
 * Integration tests for books.ts CRUD functions.
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
import { db, auth } from './firebase';
import { createReading, updateReading, deleteReading, getOrCreateBook } from './books';

// Each test uses a unique userId to avoid cross-test interference
let createdReadingId: string | null = null;
let TEST_USER_ID: string;

beforeAll(async () => {
  const userCredential = await signInAnonymously(auth);
  TEST_USER_ID = userCredential.user.uid;
});

afterEach(async () => {
  if (createdReadingId) {
    await deleteDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId)).catch(() => {});
    createdReadingId = null;
  }
});

describe('books integration (emulator)', () => {
  it('createReading writes correct fields to Firestore', async () => {
    const bookTitle = 'The Left Hand of Darkness';
    const bookAuthor = 'Ursula K. Le Guin';

    const bookId = await getOrCreateBook(bookTitle, bookAuthor, TEST_USER_ID);
    expect(bookId).toBeTruthy();

    createdReadingId = await createReading(TEST_USER_ID, bookId, ['sci-fi'], false);

    expect(createdReadingId).toBeTruthy();

    // Verify reading doc
    const readingSnap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    expect(readingSnap.exists()).toBe(true);
    const readingData = readingSnap.data()!;
    expect(readingData.bookId).toBe(bookId);
    expect(readingData.tiles).toEqual(['sci-fi']);
    expect(readingData.isFreebie).toBe(false);
    expect(readingData.createdAt).toBeTruthy();

    // Verify book doc
    const bookSnap = await getDoc(doc(db, 'books', bookId));
    expect(bookSnap.exists()).toBe(true);
    const bookData = bookSnap.data()!;
    expect(bookData.title).toBe(bookTitle);
    expect(bookData.author).toBe(bookAuthor);
    expect(bookData.titleLower).toBe(bookTitle.toLowerCase());
    expect(bookData.authorLower).toBe(bookAuthor.toLowerCase());
  });

  it('updateReading updates bookId, tiles, and sets updatedAt', async () => {
    const oldBookId = await getOrCreateBook('Old Title', 'Old Author', TEST_USER_ID);
    createdReadingId = await createReading(TEST_USER_ID, oldBookId, ['mystery'], false);

    const newBookId = await getOrCreateBook('New Title', 'New Author', TEST_USER_ID);
    await updateReading(TEST_USER_ID, createdReadingId, newBookId, ['sci-fi'], true);

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    const data = snap.data()!;
    expect(data.bookId).toBe(newBookId);
    expect(data.tiles).toEqual(['sci-fi']);
    expect(data.isFreebie).toBe(true);
    expect(data.updatedAt).toBeTruthy();
  });

  it('deleteReading removes the document', async () => {
    const bookId = await getOrCreateBook('To Be Deleted', 'Some Author', TEST_USER_ID);
    createdReadingId = await createReading(TEST_USER_ID, bookId, [], false);

    await deleteReading(TEST_USER_ID, createdReadingId);

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'readings', createdReadingId));
    expect(snap.exists()).toBe(false);
    createdReadingId = null;
  });
});
