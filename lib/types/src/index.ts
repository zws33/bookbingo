/**
 * Shared type definitions for BookBingo
 */

// =============================================================================
// Tile Types
// =============================================================================

/**
 * A bingo tile/category that books can be assigned to.
 */
export interface Tile {
  id: string;
  name: string;
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
// Reading Types
// =============================================================================

/**
 * A user's reading of a book (Firestore: /users/{userId}/readings/{readingId}).
 * Links a user to a book with user-specific tile assignments.
 */
export interface Reading {
  id: string;
  bookId: string;
  /** Legacy field for Parallel Change migration */
  bookTitle?: string;
  /** Legacy field for Parallel Change migration */
  bookAuthor?: string;
  /** Tile IDs assigned to this reading (max 3 unless freebie) */
  tiles: string[];
  /** Freebie readings can have unlimited tile assignments */
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// =============================================================================
// TBR Types
// =============================================================================

/**
 * A planned reading entry (Firestore: /users/{userId}/tbr/{tbrId}).
 * Represents a book the user intends to read, with optional planned tile assignments.
 * Never contributes to scoring — only completed Readings do.
 */
export interface TBREntry {
  id: string;
  bookId: string;
  /** Tile IDs the user plans to assign when they log this as read */
  plannedTiles: string[];
  /** Optional personal note */
  notes?: string;
  addedAt: Date;
  updatedAt?: Date;
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

/**
 * Detailed breakdown of a score calculation.
 */
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
