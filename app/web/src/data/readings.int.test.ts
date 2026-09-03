/**
 * Integration tests for getReadingsByUser against the Firestore emulator.
 *
 * Requires the Firebase emulator to be running:
 *   pnpm --filter @bookbingo/web emulator:start
 *
 * Run with:
 *   pnpm --filter @bookbingo/web test:integration
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  setDoc,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { getReadingsByUser } from './readings';

// A fresh anonymous user per run keeps writes isolated from other suites.
let TEST_USER_ID: string;
// Ids written during a test, torn down afterward.
const createdReadingIds: string[] = [];

/** Write a reading doc directly, returning its generated id. */
async function seedReading(fields: {
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}): Promise<string> {
  const ref = doc(collection(db, 'users', TEST_USER_ID, 'readings'));
  await setDoc(ref, {
    bookId: fields.bookId,
    tiles: fields.tiles,
    isFreebie: fields.isFreebie,
    readAt: Timestamp.fromDate(fields.readAt),
    createdAt: Timestamp.fromDate(fields.createdAt),
    ...(fields.updatedAt
      ? { updatedAt: Timestamp.fromDate(fields.updatedAt) }
      : {}),
  });
  createdReadingIds.push(ref.id);
  return ref.id;
}

beforeAll(async () => {
  const cred = await signInAnonymously(auth);
  TEST_USER_ID = cred.user.uid;
});

afterEach(async () => {
  await Promise.all(
    createdReadingIds.map((id) =>
      deleteDoc(doc(db, 'users', TEST_USER_ID, 'readings', id)).catch(() => {}),
    ),
  );
  createdReadingIds.length = 0;
});

describe('getReadingsByUser integration (emulator)', () => {
  it('returns readings ordered by readAt descending', async () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-03-01T00:00:00Z');
    const olderId = await seedReading({
      bookId: 'book-older',
      tiles: ['mystery'],
      isFreebie: false,
      readAt: older,
      createdAt: older,
    });
    const newerId = await seedReading({
      bookId: 'book-newer',
      tiles: ['sci-fi'],
      isFreebie: false,
      readAt: newer,
      createdAt: newer,
    });

    const readings = await getReadingsByUser(TEST_USER_ID);

    expect(readings.map((r) => r.id)).toEqual([newerId, olderId]);
  });

  it('converts Firestore Timestamps to Date and maps all fields', async () => {
    const readAt = new Date('2026-02-15T12:00:00Z');
    const createdAt = new Date('2026-02-10T08:00:00Z');
    const updatedAt = new Date('2026-02-16T09:30:00Z');
    const id = await seedReading({
      bookId: 'book-1',
      tiles: ['award-winner', 'debut'],
      isFreebie: true,
      readAt,
      createdAt,
      updatedAt,
    });

    const [reading] = await getReadingsByUser(TEST_USER_ID);

    expect(reading).toEqual({
      id,
      bookId: 'book-1',
      tiles: ['award-winner', 'debut'],
      isFreebie: true,
      readAt,
      createdAt,
      updatedAt,
    });
    expect(reading!.readAt).toBeInstanceOf(Date);
  });

  it('leaves updatedAt undefined when the field is absent', async () => {
    await seedReading({
      bookId: 'book-1',
      tiles: [],
      isFreebie: false,
      readAt: new Date('2026-02-01T00:00:00Z'),
      createdAt: new Date('2026-02-01T00:00:00Z'),
      // no updatedAt
    });

    const [reading] = await getReadingsByUser(TEST_USER_ID);

    expect(reading!.updatedAt).toBeUndefined();
  });

  it('returns an empty array when the user has no readings', async () => {
    // A distinct, unseeded user id — no docs under its readings subcollection.
    const readings = await getReadingsByUser(`${TEST_USER_ID}-empty`);
    expect(readings).toEqual([]);
  });
});
