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
 * Structured metadata for a book, sourced from external APIs (e.g., Google Books).
 */
export interface BookMetadata {
  pageCount: number | null;
  publishedDate: string | null;
  categories: string[];
  language: string | null;
  isbn: string | null;
  thumbnailUrl: string | null;
}

/**
 * Shared book entity (Firestore: /books/{bookId}).
 * Multiple users can reference the same book via their readings.
 */
export interface Book {
  id: string;
  title: string;
  author: string;
  metadata?: BookMetadata;
  /** External catalog ID (e.g., Google Books volume ID) for deduplication */
  externalId?: string | null;
  /** User ID of who first added this book */
  createdBy: string;
  createdAt: Date;
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
// Book Search / Enrichment API Contract
// =============================================================================

/**
 * Result of a book search query (via the enrichBook callable).
 * Shared contract between app/web and functions.
 */
export interface BookSearchResult {
  externalId: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
  publishedDate: string | null;
}

/**
 * Full enrichment result for a specific book (via the enrichBook callable).
 * Shared contract between app/web and functions.
 */
export interface BookEnrichmentResult {
  externalId: string;
  title: string;
  author: string;
  metadata: BookMetadata;
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
