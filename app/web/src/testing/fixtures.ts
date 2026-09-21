import type { Book, Tile, UserProfile } from '@bookbingo/lib-types';
import { EMPTY_METADATA } from '@bookbingo/lib-types';
import type { Reading, TBREntry } from '../types/schemas';

/**
 * A four-tile stand-in for the served catalog. Ids and names match the real
 * ones so assertions read the way the UI does, but the list stays small enough
 * that a test can assert on the whole of it.
 */
export const TILE = {
  reread: { id: 't01', name: 'unfinished reread' },
  series: { id: 't02', name: 'part of a series' },
  long: { id: 't03', name: '1000+ pages' },
  short: { id: 't04', name: 'under 100 pages' },
} as const;

export const TILE_CATALOG: Tile[] = Object.values(TILE);

export const MAX_TILES_PER_BOOK = 3;

/**
 * Stands in for `useTileCatalog` in component tests, which would otherwise
 * call a Cloud Function. Use it through a `vi.mock` factory:
 *
 *   vi.mock('../hooks/useTileCatalog', async () => ({
 *     useTileCatalog: (await import('../testing/fixtures')).tileCatalogStub,
 *   }));
 */
export function tileCatalogStub() {
  return {
    tiles: TILE_CATALOG,
    maxTilesPerBook: MAX_TILES_PER_BOOK,
    getTileById: (id: string) => TILE_CATALOG.find((tile) => tile.id === id),
    loading: false,
    error: undefined,
  };
}

/** A reading as the API returns it: book fields already joined. */
export function makeReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 'reading-1',
    bookId: 'book-1',
    bookTitle: 'The Left Hand of Darkness',
    bookAuthor: 'Ursula K. Le Guin',
    bookMetadata: EMPTY_METADATA,
    tiles: [TILE.series.id],
    isFreebie: false,
    readAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeTBREntry(overrides: Partial<TBREntry> = {}): TBREntry {
  return {
    id: 'tbr-1',
    bookId: 'book-1',
    bookTitle: 'The Left Hand of Darkness',
    bookAuthor: 'Ursula K. Le Guin',
    bookMetadata: EMPTY_METADATA,
    plannedTiles: [TILE.series.id],
    addedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    metadata: EMPTY_METADATA,
    ...overrides,
  };
}

export function makeUserProfile(
  overrides: Partial<UserProfile> = {},
): UserProfile {
  return {
    id: 'user-1',
    name: 'Test User',
    photoURL: null,
    ...overrides,
  };
}
