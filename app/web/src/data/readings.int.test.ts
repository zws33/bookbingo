/**
 * Integration tests for the reading callables against the emulators.
 *
 * Run with: pnpm run test:integration (starts the emulators via firebase
 * emulators:exec), or against a running emulator with
 * pnpm --filter @bookbingo/web test:integration.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  closeAdminApp,
  deleteDocs,
  seedBook,
  signInTestUser,
  signOutTestUser,
} from '../testing/int';
import {
  createReading,
  deleteReading,
  listReadings,
  updateReading,
} from './readings';

const TILE = { series: 't02', reread: 't01', long: 't03', short: 't04' };

let userId: string;
const createdPaths: string[] = [];

/** Tracks a reading for teardown and returns its id. */
function track(readingId: string): string {
  createdPaths.push(`users/${userId}/readings/${readingId}`);
  return readingId;
}

beforeAll(async () => {
  userId = await signInTestUser();
  await seedBook('book-int-1');
  await seedBook('book-int-2', { title: 'Emma', author: 'Jane Austen' });
  createdPaths.push('books/book-int-1', 'books/book-int-2');
});

afterEach(async () => {
  const readings = await adminDb().collection(`users/${userId}/readings`).get();
  await deleteDocs(readings.docs.map((doc) => doc.ref.path));
});

afterAll(async () => {
  await deleteDocs(['books/book-int-1', 'books/book-int-2']);
  await signOutTestUser();
  await closeAdminApp();
});

describe.sequential('reading callables (emulator)', () => {
  it('creates a reading and returns it with its book joined', async () => {
    const { readingId } = await createReading({
      bookId: 'book-int-1',
      tiles: [TILE.series],
      isFreebie: false,
    });
    track(readingId);

    const { readings, score } = await listReadings({ userId });

    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      id: readingId,
      bookId: 'book-int-1',
      bookTitle: 'Dune',
      bookAuthor: 'Frank Herbert',
      tiles: [TILE.series],
      isFreebie: false,
    });
    expect(readings[0]?.bookMetadata.pageCount).toBe(412);
    expect(readings[0]?.readAt).toBeInstanceOf(Date);
    expect(score.totalBooks).toBe(1);
    expect(score.score).toBeGreaterThan(0);
  });

  it('rejects a reading for a book that does not exist', async () => {
    await expect(
      createReading({ bookId: 'no-such-book', tiles: [], isFreebie: false }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
  });

  it('rejects a fourth tile on a non-freebie', async () => {
    await expect(
      createReading({
        bookId: 'book-int-1',
        tiles: [TILE.series, TILE.reread, TILE.long, TILE.short],
        isFreebie: false,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('rejects a tile that is not in the catalog', async () => {
    await expect(
      createReading({
        bookId: 'book-int-1',
        tiles: ['not-a-tile'],
        isFreebie: false,
      }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  // The rule lib/core stated but nothing ever enforced.
  it('allows one freebie and rejects a second', async () => {
    const first = await createReading({
      bookId: 'book-int-1',
      tiles: [TILE.series, TILE.reread, TILE.long, TILE.short],
      isFreebie: true,
    });
    track(first.readingId);

    await expect(
      createReading({
        bookId: 'book-int-2',
        tiles: [TILE.series],
        isFreebie: true,
      }),
    ).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });

  it('updates tiles and the book of an existing reading', async () => {
    const { readingId } = await createReading({
      bookId: 'book-int-1',
      tiles: [TILE.series],
      isFreebie: false,
    });
    track(readingId);

    await updateReading({
      readingId,
      bookId: 'book-int-2',
      tiles: [TILE.reread, TILE.long],
      isFreebie: false,
    });

    const { readings } = await listReadings({ userId });
    expect(readings[0]).toMatchObject({
      bookId: 'book-int-2',
      bookTitle: 'Emma',
      tiles: [TILE.reread, TILE.long],
    });
    expect(readings[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects an update to a reading id that is not the caller own', async () => {
    await expect(
      updateReading({
        readingId: 'someone-elses-reading',
        bookId: 'book-int-1',
        tiles: [],
        isFreebie: false,
      }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
  });

  it('deletes a reading', async () => {
    const { readingId } = await createReading({
      bookId: 'book-int-1',
      tiles: [],
      isFreebie: false,
    });

    await deleteReading({ readingId });

    const { readings } = await listReadings({ userId });
    expect(readings).toHaveLength(0);
  });
});
