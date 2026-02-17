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
  /** Manual tiles require external verification (e.g., "recommended by a librarian") */
  isManual: boolean;
}

// =============================================================================
// User Types
// =============================================================================

/**
 * A user in the system.
 */
export interface User {
  id: string;
  name: string;
  email?: string;
  createdAt: Date;
}

// =============================================================================
// Book Types
// =============================================================================

/**
 * A book associated with a user, used by the scoring engine in lib/core.
 */
export interface UserBook {
  id: string;
  userId: string;
  title: string;
  author: string;
  /** Tile IDs assigned to this book (max 3 unless freebie) */
  tiles: string[];
  /** Freebie books can have unlimited tile assignments */
  isFreebie: boolean;
  readAt: Date;
}

// =============================================================================
// Firestore Types
// =============================================================================

/**
 * Shared book metadata (Firestore: /books/{bookId}).
 * Multiple users can reference the same book.
 */
export interface Book {
  id: string;
  title: string;
  author: string;
  createdAt: Date;
  /** User ID of who first added this book */
  createdBy: string;
}

/**
 * A user's reading of a book (Firestore: /users/{userId}/readings/{readingId}).
 * Contains user-specific data like tile assignments.
 */
export interface Reading {
  id: string;
  bookId: string;
  /** Denormalized for filtering/display */
  bookTitle: string;
  /** Denormalized for filtering/display */
  bookAuthor: string;
  /** Tile IDs assigned to this reading (max 3 unless freebie) */
  tiles: string[];
  /** Freebie readings can have unlimited tile assignments */
  isFreebie: boolean;
  readAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// =============================================================================
// Scoring Types
// =============================================================================

/**
 * Detailed breakdown of a score calculation.
 */
export interface ScoreBreakdown {
  score: number;
  basePoints: number;
  balanceMultiplier: number;
  tileCounts: Map<string, number>;
  totalBooks: number;
}
