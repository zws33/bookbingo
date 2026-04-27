import { BookProvider, BookSearchResult, BookEnrichmentResult } from './types.js';

/**
 * Orchestrates one or more BookProviders to search and enrich book data.
 */
export class BookEnrichmentService {
  constructor(private provider: BookProvider) {}

  /**
   * Searches for books matching the query.
   */
  async searchBooks(query: string): Promise<BookSearchResult[]> {
    if (!query.trim()) return [];
    return this.provider.search(query);
  }

  /**
   * Fetches full metadata for a specific book by its provider-specific ID.
   */
  async getBookDetails(externalId: string): Promise<BookEnrichmentResult> {
    if (!externalId) throw new Error('externalId is required');
    return this.provider.lookup(externalId);
  }
}
