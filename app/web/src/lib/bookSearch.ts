import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type {
  BookSearchResult,
  BookEnrichmentResult,
} from '@bookbingo/lib-types';
import {
  SearchBooksResponseSchema,
  BookEnrichmentResultSchema,
} from '@bookbingo/lib-types';
import { log } from '@bookbingo/lib-util';
import { functions } from './firebase';

export type { BookSearchResult, BookEnrichmentResult };

const enrichBook = httpsCallable(functions, 'enrichBook');

/**
 * The callable's error code, e.g. `functions/unavailable`. This is the field
 * that pairs a client-side failure with the `enrich.*` event the function
 * logged for the same request, so log it on every failure.
 */
function errorCode(error: unknown): string {
  const code = (error as Partial<FunctionsError> | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const startedAt = Date.now();
  try {
    const result = await enrichBook({ action: 'search', query });
    const parsed = SearchBooksResponseSchema.parse(result.data);
    log.event('book_search', {
      result_count: parsed.length,
      duration_ms: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    log.error('bookSearch', error);
    log.event('book_enrich_error', {
      action: 'search',
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function lookupBook(
  externalId: string,
): Promise<BookEnrichmentResult> {
  const startedAt = Date.now();
  try {
    const result = await enrichBook({ action: 'lookup', externalId });
    const parsed = BookEnrichmentResultSchema.parse(result.data);
    log.event('book_lookup', {
      external_id: externalId,
      duration_ms: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    log.error('bookSearch', error);
    log.event('book_enrich_error', {
      action: 'lookup',
      external_id: externalId,
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}
