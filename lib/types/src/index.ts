// =============================================================================
// Tile Types
// =============================================================================

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

// =============================================================================
// Book Types
// =============================================================================

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

// =============================================================================
// Scoring Types
// =============================================================================

/**
 * Minimal input for the scoring engine. Any object with tiles and freebie status works.
 */
export interface ScoringInput {
  tiles: string[];
  isFreebie: boolean;
}

/**
 * The scoring strategy determines how balance affects the score.
 * - 'balanced-harmonic': Applies a balance factor that penalizes uneven tile distribution
 * - 'harmonic': Pure harmonic diminishing returns with no balance penalty
 */
export type ScoringStrategy = 'harmonic' | 'balanced-harmonic';

export interface ScoreBreakdown {
  score: number;
  /** Number of unique tiles with at least one book (1 point each, never penalized) */
  varietyPoints: number;
  /** Sum of harmonic diminishing returns for repeat books: Σ (H(countₜ) - 1) */
  volumePoints: number;
  /** Balance scaling factor: 1/(1+CV²) for balanced-harmonic, 1.0 for harmonic */
  balanceFactor: number;
  tileCounts: Map<string, number>;
  totalBooks: number;
}

// =============================================================================
// User Types
// =============================================================================

export interface UserProfile {
  id: string;
  name: string;
  /** null, not absent: JSON reads an omitted key and an explicit null the same. */
  photoURL: string | null;
}
