/**
 * Integration tests for the TBR repository against the Firestore emulator.
 *
 * Requires the Firebase emulator to be running:
 *   pnpm --filter @bookbingo/web emulator:start
 *
 * Run with:
 *   pnpm --filter @bookbingo/web test:integration
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import {
  createTBREntry,
  deleteTBREntry,
  promoteTBREntry,
  updateTBREntry,
} from './tbr';

// A fresh anonymous user per run keeps writes isolated from other suites.
let TEST_USER_ID: string;

beforeAll(async () => {
  const cred = await signInAnonymously(auth);
  TEST_USER_ID = cred.user.uid;
});

// Both subcollections are cleared wholesale — promoteTBREntry generates a
// reading id the test never sees until it returns, and a failed batch would
// leave either side behind.
afterEach(async () => {
  for (const name of ['tbr', 'readings']) {
    const snap = await getDocs(collection(db, 'users', TEST_USER_ID, name));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  }
});

describe('TBR writes integration (emulator)', () => {
  it('createTBREntry writes the entry and omits blank notes', async () => {
    const id = await createTBREntry(TEST_USER_ID, 'book-1', ['sci-fi'], '  ');

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'tbr', id));
    expect(snap.exists()).toBe(true);
    const data = snap.data()!;
    expect(data.bookId).toBe('book-1');
    expect(data.plannedTiles).toEqual(['sci-fi']);
    expect(data.notes).toBeUndefined();
    expect(data.addedAt).toBeTruthy();
  });

  it('updateTBREntry removes the notes field when cleared', async () => {
    const id = await createTBREntry(TEST_USER_ID, 'book-1', [], 'a note');

    await updateTBREntry(TEST_USER_ID, id, ['mystery'], '');

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'tbr', id));
    const data = snap.data()!;
    expect(data.plannedTiles).toEqual(['mystery']);
    // deleteField() removes the key rather than storing null.
    expect('notes' in data).toBe(false);
    expect(data.updatedAt).toBeTruthy();
  });

  it('deleteTBREntry removes the document', async () => {
    const id = await createTBREntry(TEST_USER_ID, 'book-1', []);

    await deleteTBREntry(TEST_USER_ID, id);

    const snap = await getDoc(doc(db, 'users', TEST_USER_ID, 'tbr', id));
    expect(snap.exists()).toBe(false);
  });

  it('promoteTBREntry creates the reading and removes the entry atomically', async () => {
    const tbrId = await createTBREntry(TEST_USER_ID, 'book-1', ['sci-fi']);

    const readingId = await promoteTBREntry(
      TEST_USER_ID,
      tbrId,
      'book-1',
      ['sci-fi'],
      true,
    );

    const reading = await getDoc(
      doc(db, 'users', TEST_USER_ID, 'readings', readingId),
    );
    expect(reading.exists()).toBe(true);
    const data = reading.data()!;
    expect(data.bookId).toBe('book-1');
    expect(data.tiles).toEqual(['sci-fi']);
    expect(data.isFreebie).toBe(true);
    expect(data.readAt).toBeTruthy();
    expect(data.createdAt).toBeTruthy();

    const entry = await getDoc(doc(db, 'users', TEST_USER_ID, 'tbr', tbrId));
    expect(entry.exists()).toBe(false);
  });
});
