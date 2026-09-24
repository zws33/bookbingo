import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type { Book } from '@bookbingo/lib-types';
import { log } from '@bookbingo/lib-util';
import { functions } from './firebase';
import {
  BookResponseSchema,
  SearchBooksResponseSchema,
  type BookSearchResult,
} from 'src/types/schemas';

const api = {
  fetchBookDetails: httpsCallable(functions, 'fetchBookDetails'),
  searchBooks: httpsCallable(functions, 'searchBooks'),
};

/** Pairs a `book_search*`/`book_fetch*` failure with the function's `book.search`/`book.fetch` event. */
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

/** Ensures the catalog book exists in `/books` and returns it whole. */
export async function resolveBook(externalId: string): Promise<Book> {
  const startedAt = Date.now();
  try {
    const result = await api.fetchBookDetails({
      externalId,
    });
    const parsed = BookResponseSchema.parse(result.data);
    log.event('book_fetch', {
      external_id: externalId,
      duration_ms: Date.now() - startedAt,
    });
    return parsed;
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
