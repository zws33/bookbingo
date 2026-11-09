import { HttpsError } from 'firebase-functions/v2/https';
import { ProviderError } from './types.js';

/**
 * Maps an upstream failure to a callable error code.
 *
 * The distinction that matters to a caller is retryable vs. not: `not-found`
 * means stop, `unavailable` means try again. Everything that reaches here
 * without an upstream status is a bug on our side, so it stays `internal`.
 * Upstream error text is never forwarded — it reaches Cloud Logging instead.
 */
export function toHttpsError(
  error: unknown,
  fallbackMessage: string,
): HttpsError {
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
