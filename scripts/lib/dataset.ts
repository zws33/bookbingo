/**
 * Declarative synthetic dataset for staging.
 *
 * Books are referenced by a local `handle`; their Firestore id is derived with
 * the SAME `deriveBookId` the app uses, so two personas that share a handle
 * converge to one `/books/{id}` doc — exercising dedup and the community library
 * exactly as real usage would. Tiles use real ids from `lib/core` constants
 * (`t01`–`t43`, `m01`–`m06`).
 */

import { deriveBookId } from '@bookbingo/lib-core';
import type { BookMetadata } from '@bookbingo/lib-types';

export interface SeedBook {
  handle: string;
  title: string;
  author: string;
  /** Open Library Work key, present only for "enriched" books. */
  openLibraryKey?: string;
  metadata?: BookMetadata;
}

export interface SeedReadingSpec {
  /** SeedBook.handle */
  book: string;
  tiles: string[];
  isFreebie?: boolean;
  daysAgo: number;
}

export interface SeedTbrSpec {
  /** SeedBook.handle */
  book: string;
  plannedTiles?: string[];
  notes?: string;
  daysAgo: number;
}

export interface SeedUser {
  uid: string;
  name: string;
  readings: SeedReadingSpec[];
  tbr: SeedTbrSpec[];
}

/** Deterministic `/books/{id}` for a seed book — same contract as the app. */
export function bookIdFor(book: SeedBook): string {
  return deriveBookId({
    openLibraryKey: book.openLibraryKey,
    title: book.title,
    author: book.author,
  });
}

// ---------------------------------------------------------------------------
// Books — a mix of OL-enriched (externalIds + metadata) and manual entries.
// ---------------------------------------------------------------------------

export const BOOKS: SeedBook[] = [
  {
    handle: 'dune',
    title: 'Dune',
    author: 'Frank Herbert',
    openLibraryKey: '/works/OL893415W',
    metadata: {
      pageCount: 412,
      publishedDate: '1965',
      categories: ['Science Fiction'],
      language: 'en',
      isbn: '9780441013593',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8101356-M.jpg',
    },
  },
  {
    handle: 'hobbit',
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    openLibraryKey: '/works/OL262758W',
    metadata: {
      pageCount: 310,
      publishedDate: '1937',
      categories: ['Fantasy'],
      language: 'en',
      isbn: '9780261103344',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/6979861-M.jpg',
    },
  },
  {
    handle: 'lhd',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    openLibraryKey: '/works/OL455403W',
    metadata: {
      pageCount: 304,
      publishedDate: '1969',
      categories: ['Science Fiction'],
      language: 'en',
      isbn: '9780441478125',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    },
  },
  {
    handle: 'piranesi',
    title: 'Piranesi',
    author: 'Susanna Clarke',
    openLibraryKey: '/works/OL20893147W',
    metadata: {
      pageCount: 245,
      publishedDate: '2020',
      categories: ['Fantasy'],
      language: 'en',
      isbn: '9781635575637',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/10523107-M.jpg',
    },
  },
  {
    handle: 'lolita',
    title: 'Lolita',
    author: 'Vladimir Nabokov',
    openLibraryKey: '/works/OL2663688W',
    metadata: {
      pageCount: 336,
      publishedDate: '1955',
      categories: ['Fiction'],
      language: 'en',
      isbn: '9780679723165',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231991-M.jpg',
    },
  },
  {
    handle: 'maus',
    title: 'Maus',
    author: 'Art Spiegelman',
    openLibraryKey: '/works/OL1854695W',
    metadata: {
      pageCount: 296,
      publishedDate: '1991',
      categories: ['Graphic Novel'],
      language: 'en',
      isbn: '9780679406419',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    },
  },
  {
    handle: 'annihilation',
    title: 'Annihilation',
    author: 'Jeff VanderMeer',
    openLibraryKey: '/works/OL16802461W',
    metadata: {
      pageCount: 208,
      publishedDate: '2014',
      categories: ['Science Fiction'],
      language: 'en',
      isbn: '9780374104092',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/7314554-M.jpg',
    },
  },
  {
    handle: 'tinker',
    title: 'Tinker, Tailor, Soldier, Spy',
    author: 'John le Carré',
    openLibraryKey: '/works/OL5847897W',
    metadata: {
      pageCount: 384,
      publishedDate: '1974',
      categories: ['Thriller'],
      language: 'en',
      isbn: '9780743457903',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    },
  },
  {
    handle: 'beloved',
    title: 'Beloved',
    author: 'Toni Morrison',
    openLibraryKey: '/works/OL166894W',
    metadata: {
      pageCount: 324,
      publishedDate: '1987',
      categories: ['Fiction'],
      language: 'en',
      isbn: '9781400033416',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    },
  },
  {
    handle: 'circe',
    title: 'Circe',
    author: 'Madeline Miller',
    openLibraryKey: '/works/OL17608383W',
    metadata: {
      pageCount: 393,
      publishedDate: '2018',
      categories: ['Fantasy'],
      language: 'en',
      isbn: '9780316556347',
      thumbnailUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    },
  },
  // Manual entries (no external catalog reference, no metadata).
  { handle: 'homegoing', title: 'Homegoing', author: 'Yaa Gyasi' },
  { handle: 'godot', title: 'Waiting for Godot', author: 'Samuel Beckett' },
  { handle: 'worm', title: 'Worm', author: 'Wildbow' },
  {
    handle: 'lathe',
    title: 'The Lathe of Heaven',
    author: 'Ursula K. Le Guin',
  },
  { handle: 'kindred', title: 'Kindred', author: 'Octavia E. Butler' },
  { handle: 'pachinko', title: 'Pachinko', author: 'Min Jin Lee' },
];

// ---------------------------------------------------------------------------
// Personas — distinct shapes to exercise scoring, dedup, and edge cases.
// Shared handles (dune, hobbit, lhd, beloved) appear across users on purpose.
// ---------------------------------------------------------------------------

export const USERS: SeedUser[] = [
  {
    // Heavy reader — broad variety across many tiles.
    uid: 'staging-seed-alice',
    name: 'Alice Heavyreader',
    readings: [
      { book: 'piranesi', tiles: ['t39', 't25'], daysAgo: 70 },
      { book: 'annihilation', tiles: ['t39', 't26'], daysAgo: 58 },
      { book: 'lolita', tiles: ['t11', 't24', 't39'], daysAgo: 45 },
      { book: 'homegoing', tiles: ['t26', 't22'], daysAgo: 33 },
      { book: 'maus', tiles: ['t05', 't18'], daysAgo: 25 },
      { book: 'dune', tiles: ['t02', 't25'], daysAgo: 18 },
      { book: 'circe', tiles: ['t34', 't27'], daysAgo: 9 },
      { book: 'kindred', tiles: ['t43', 't15'], daysAgo: 3 },
    ],
    tbr: [
      { book: 'beloved', plannedTiles: ['t18', 't22'], daysAgo: 12 },
      {
        book: 'pachinko',
        plannedTiles: ['t11'],
        notes: 'book club pick',
        daysAgo: 5,
      },
    ],
  },
  {
    // Repeat-heavy — same tiles recur to build volume points.
    uid: 'staging-seed-bob',
    name: 'Bob Repeater',
    readings: [
      { book: 'hobbit', tiles: ['t02', 't25'], daysAgo: 80 },
      { book: 'dune', tiles: ['t02', 't25'], daysAgo: 60 },
      { book: 'tinker', tiles: ['t41', 't31'], daysAgo: 40 },
      { book: 'godot', tiles: ['t04', 't33'], daysAgo: 28 },
      { book: 'lathe', tiles: ['t43', 't25'], daysAgo: 15 },
      { book: 'worm', tiles: ['t03', 't02'], daysAgo: 6 },
    ],
    tbr: [{ book: 'circe', plannedTiles: ['t34'], daysAgo: 4 }],
  },
  {
    // Light reader with a large to-be-read backlog.
    uid: 'staging-seed-carol',
    name: 'Carol Plansalot',
    readings: [
      { book: 'beloved', tiles: ['t18', 't22'], daysAgo: 50 },
      { book: 'circe', tiles: ['t34', 't27'], daysAgo: 20 },
    ],
    tbr: [
      { book: 'hobbit', plannedTiles: ['t02'], daysAgo: 30 },
      { book: 'dune', plannedTiles: ['t02', 't25'], daysAgo: 27 },
      { book: 'pachinko', plannedTiles: ['t11'], daysAgo: 21 },
      {
        book: 'kindred',
        plannedTiles: ['t43'],
        notes: 'lend from Dave',
        daysAgo: 14,
      },
      { book: 'lolita', plannedTiles: ['t24'], daysAgo: 10 },
      { book: 'maus', plannedTiles: ['t05'], daysAgo: 2 },
    ],
  },
  {
    // Freebie-heavy — exercises the unlimited-tile freebie path.
    uid: 'staging-seed-dave',
    name: 'Dave Freebie',
    readings: [
      {
        book: 'worm',
        tiles: ['t03', 't02', 't26', 't39'],
        isFreebie: true,
        daysAgo: 65,
      },
      {
        book: 'pachinko',
        tiles: ['t11', 't26', 't22'],
        isFreebie: true,
        daysAgo: 44,
      },
      {
        book: 'beloved',
        tiles: ['t18', 't22', 't24'],
        isFreebie: true,
        daysAgo: 22,
      },
      { book: 'tinker', tiles: ['t41'], daysAgo: 12 },
      { book: 'godot', tiles: ['t04'], daysAgo: 4 },
    ],
    tbr: [{ book: 'lhd', plannedTiles: ['t25', 't13'], daysAgo: 8 }],
  },
  {
    // Brand-new member — no readings yet, a single TBR entry. Edge case for
    // leaderboard/empty-state rendering.
    uid: 'staging-seed-erin',
    name: 'Erin Newcomer',
    readings: [],
    tbr: [
      {
        book: 'dune',
        plannedTiles: ['t02'],
        notes: 'starting here!',
        daysAgo: 1,
      },
    ],
  },
];
