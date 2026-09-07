import type {
  BookSearchResult,
  BookEnrichmentResult,
} from '@bookbingo/lib-types';

export type { BookSearchResult, BookEnrichmentResult };

/**
 * A failed upstream provider call, carrying enough to classify it without the
 * handler knowing which provider threw.
 *
 * `status` is the upstream HTTP status, or `null` when the request never got a
 * response (DNS, connect timeout, reset socket). That distinction is the whole
 * point of the type: a 404 means the book is absent, while `null` or a 5xx
 * means the provider is having a bad minute and the caller should retry.
 */
export class ProviderError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(
    message: string,
    options: { status: number | null; url: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.status = options.status;
    this.url = options.url;
  }
}

/**
 * Contract for a book data provider (e.g., Google Books, Open Library).
 */
export interface BookProvider {
  /** Search for books by title/author query */
  search(query: string): Promise<BookSearchResult[]>;

  /** Fetch full metadata for a specific external ID */
  getDetails(externalId: string): Promise<BookEnrichmentResult>;
}
