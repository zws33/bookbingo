import type { BookMetadata } from '@bookbingo/lib-types';

/**
 * Result of a book search. Includes basic display info and the external ID.
 */
export interface BookSearchResult {
  externalId: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
  publishedDate: string | null;
}

/**
 * Full enrichment result for a specific book.
 */
export interface BookEnrichmentResult {
  metadata: BookMetadata;
  externalId: string;
  title: string;
  author: string;
}

/**
 * Contract for a book data provider (e.g., Google Books, Open Library).
 */
export interface BookProvider {
  /** Search for books by title/author query */
  search(query: string): Promise<BookSearchResult[]>;
  
  /** Fetch full metadata for a specific external ID */
  lookup(externalId: string): Promise<BookEnrichmentResult>;
}
