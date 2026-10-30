export interface Tile {
  id: string;
  name: string;
}

/**
 * Served board configuration: tile vocabulary plus the per-reading tile cap.
 */
export interface BoardConfig {
  tiles: Tile[];
  maxTilesPerBook: number;
}

/**
 * Everything known about a book beyond its identity. Every field is nullable
 * or empty-able and the container is always present. That invariant is what
 * makes the struct evolvable: adding a field is backward-compatible via the
 * read-time default, and removing one is a client-side deletion.
 *
 * Defined by role, not by source — a provider's payload shape belongs to that
 * provider (functions/src/books/types.ts), not here.
 */
export interface BookMetadata {
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
}

/** Every field unknown. The read-time default and the manual-entry default. */
export const EMPTY_METADATA: BookMetadata = {
  pageCount: null,
  publishedDate: null,
  categories: [],
  language: null,
  isbn: null,
  thumbnailUrl: null,
};

export interface Book {
  id: string;
  title: string;
  author: string;
  metadata: BookMetadata;
}

/**
 * Minimal input for the scoring engine. Any object with tiles and freebie status works.
 */
export interface ScoringInput {
  tiles: string[];
  isFreebie: boolean;
}

/**
 * What every scoring engine produces, whatever curve it uses. Engine-specific
 * intermediates stay inside the engine: naming one here would oblige the others
 * to report a value it does not have.
 */
export interface ScoreBreakdown {
  score: number;
  /** Tiles holding at least one book, worth a point each. */
  varietyPoints: number;
  /** What the repeats past the first book in each tile are worth. */
  volumePoints: number;
  tileCounts: Map<string, number>;
  totalBooks: number;
}

export interface UserProfile {
  id: string;
  name: string;
  /** null, not absent: JSON reads an omitted key and an explicit null the same. */
  photoURL: string | null;
}
