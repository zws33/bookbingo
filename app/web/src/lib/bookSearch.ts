import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { log } from '@bookbingo/lib-util';
import { functions } from './firebase';
import {
  BookDetailsResultSchema,
  SearchBooksResponseSchema,
  type BookSearchResult,
} from 'src/types/schemas';

const api = {
  fetchBookDetails: httpsCallable(functions, 'fetchBookDetails'),
  searchBooks: httpsCallable(functions, 'searchBooks'),
};

/**
 * The callable's error code, e.g. `functions/unavailable`. This is the field
 * that pairs a client-side `book_search*`/`book_fetch*` failure with the
 * `book.search`/`book.fetch` event the function logged for the same request,
 * so log it on every failure.
 */
function errorCode(error: unknown): string {
  const code = (error as Partial<FunctionsError> | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const startedAt = Date.now();
  try {
    const result = await api.searchBooks({ q: query });
    const parsed = SearchBooksResponseSchema.parse(result.data);
    log.event('book_search', {
      result_count: parsed.length,
      duration_ms: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    log.error('bookSearch', error);
    log.event('book_search_error', {
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}

/**
 * Ensures the catalog book exists in `/books` and returns its id.
 *
 * The callable also returns title and author, but the UI reads those from the
 * `/books` subscription — the single source of truth — so the response's other
 * fields stop here rather than becoming state the components carry.
 */
export async function resolveBookId(externalId: string): Promise<string> {
  const startedAt = Date.now();
  try {
    const result = await api.fetchBookDetails({
      externalId,
    });
    const parsed = BookDetailsResultSchema.parse(result.data);
    log.event('book_fetch', {
      external_id: externalId,
      duration_ms: Date.now() - startedAt,
    });
    return parsed.bookId;
  } catch (error) {
    log.error('bookFetch', error);
    log.event('book_fetch_error', {
      external_id: externalId,
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}
