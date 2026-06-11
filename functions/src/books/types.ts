import type { BookSearchResult, BookEnrichmentResult } from '@bookbingo/lib-types';

export type { BookSearchResult, BookEnrichmentResult };

/**
 * Contract for a book data provider (e.g., Google Books, Open Library).
 */
export interface BookProvider {
  /** Search for books by title/author query */
  search(query: string): Promise<BookSearchResult[]>;

  /** Fetch full metadata for a specific external ID */
  lookup(externalId: string): Promise<BookEnrichmentResult>;
}
