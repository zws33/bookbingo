import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { BookProvider, ProviderSearchResult } from './types.js';
import { ProviderError } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';
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

/**
 * Maps an upstream failure to a callable error code.
 *
 * The distinction that matters to a caller is retryable vs. not: `not-found`
 * means stop, `unavailable` means try again. Everything that reaches here
 * without an upstream status is a bug on our side, so it stays `internal`.
 * Upstream error text is never forwarded — it reaches Cloud Logging instead.
 */
function toHttpsError(error: unknown, fallbackMessage: string): HttpsError {
  if (!(error instanceof ProviderError)) {
    return new HttpsError('internal', fallbackMessage);
  }
  if (error.status === 404) {
    return new HttpsError(
      'not-found',
      'That book is no longer in the catalog.',
    );
  }
  if (error.status === null || error.status >= 500 || error.status === 429) {
    return new HttpsError(
      'unavailable',
      'Open Library is not responding. Please try again.',
    );
  }
  return new HttpsError('internal', fallbackMessage);
}
