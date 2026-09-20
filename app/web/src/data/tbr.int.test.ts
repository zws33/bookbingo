/**
 * Integration tests for the TBR callables against the emulators.
 *
 * Run with: pnpm run test:integration.
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
  createTBREntry,
  deleteTBREntry,
  listMyTBR,
  promoteTBREntry,
  updateTBREntry,
} from './tbr';
import { listReadings } from './readings';

const TILE = { series: 't02', reread: 't01', long: 't03', short: 't04' };

let userId: string;

beforeAll(async () => {
  userId = await signInTestUser();
  await seedBook('book-tbr-1');
});

afterEach(async () => {
  for (const path of [`users/${userId}/tbr`, `users/${userId}/readings`]) {
    const docs = await adminDb().collection(path).get();
    await deleteDocs(docs.docs.map((doc) => doc.ref.path));
  }
});

afterAll(async () => {
  await deleteDocs(['books/book-tbr-1']);
  await signOutTestUser();
  await closeAdminApp();
});

describe.sequential('TBR callables (emulator)', () => {
  it('creates an entry and returns it with its book joined', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [TILE.series],
      notes: 'borrowed from the library',
    });

    const entries = await listMyTBR();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: tbrId,
      bookId: 'book-tbr-1',
      bookTitle: 'Dune',
      bookAuthor: 'Frank Herbert',
      plannedTiles: [TILE.series],
      notes: 'borrowed from the library',
    });
    expect(entries[0]?.addedAt).toBeInstanceOf(Date);
  });

  // Without this check the entry would be written, and listMyTBR would then
  // fail for the whole list with no way to delete the row from the UI.
  it('rejects an entry for a book that does not exist', async () => {
    await expect(
      createTBREntry({ bookId: 'no-such-book', plannedTiles: [] }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
  });

  // A plan is not a reading, so the three-tile cap does not apply yet.
  it('accepts more planned tiles than a reading may carry', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [TILE.series, TILE.reread, TILE.long, TILE.short],
    });

    expect(tbrId).toMatch(/\S+/);
  });

  it('rejects a planned tile that is not in the catalog', async () => {
    await expect(
      createTBREntry({ bookId: 'book-tbr-1', plannedTiles: ['not-a-tile'] }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('clears the note when an update omits it', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [],
      notes: 'to remove',
    });

    await updateTBREntry({ tbrId, plannedTiles: [TILE.reread] });

    const [entry] = await listMyTBR();
    expect(entry?.notes).toBeUndefined();
    expect(entry?.plannedTiles).toEqual([TILE.reread]);
  });

  it('deletes an entry', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [],
    });

    await deleteTBREntry({ tbrId });

    expect(await listMyTBR()).toHaveLength(0);
  });

  it('promotes an entry into a reading that keeps its id', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [TILE.series],
    });

    const { readingId } = await promoteTBREntry({
      tbrId,
      tiles: [TILE.series],
      isFreebie: false,
    });

    expect(readingId).toBe(tbrId);
    expect(await listMyTBR()).toHaveLength(0);

    const { readings } = await listReadings({ userId });
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      id: tbrId,
      bookId: 'book-tbr-1',
      bookTitle: 'Dune',
      tiles: [TILE.series],
    });
  });

  // A promote whose response is lost leaves the user retrying. The retry must
  // return the reading that was already written, not "entry no longer exists".
  it('returns the same reading when a promote is retried', async () => {
    const { tbrId } = await createTBREntry({
      bookId: 'book-tbr-1',
      plannedTiles: [TILE.series],
    });

    const first = await promoteTBREntry({
      tbrId,
      tiles: [TILE.series],
      isFreebie: false,
    });
    const retry = await promoteTBREntry({
      tbrId,
      tiles: [TILE.series],
      isFreebie: false,
    });

    expect(retry.readingId).toBe(first.readingId);

    const { readings } = await listReadings({ userId });
    expect(readings).toHaveLength(1);
  });

  it('reports a promote of an id that never existed as not-found', async () => {
    await expect(
      promoteTBREntry({ tbrId: 'never-existed', tiles: [], isFreebie: false }),
    ).rejects.toMatchObject({ code: 'functions/not-found' });
  });
});
