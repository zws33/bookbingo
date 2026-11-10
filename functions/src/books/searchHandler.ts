import { type CallableRequest } from 'firebase-functions/v2/https';
import type { BookProvider, ProviderSearchResult } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';
import { toHttpsError } from './providerErrors.js';
import { logEvent, logFailure } from '../observability.js';
import { parseRequest, requireAuth } from '../callable.js';
import { BookSearchQuerySchema } from './schema.js';

const provider: BookProvider = new OpenLibraryProvider();

export async function searchBooksHandler(
  request: CallableRequest<unknown>,
): Promise<ProviderSearchResult[]> {
  const { uid } = requireAuth(request, 'search for books');
  const { q } = parseRequest(BookSearchQuerySchema, request.data);
  const startedAt = Date.now();

  try {
    const results = await provider.search(q);
    logEvent('book.search', {
      uid,
      outcome: 'ok',
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });
    return results;
  } catch (error) {
    logFailure('book.search', error, {
      uid,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });
    throw toHttpsError(error, 'Book search is unavailable.');
  }
}
