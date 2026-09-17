import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type {
  ProviderBookDetails,
  BookProvider,
  ProviderSearchResult,
} from './types.js';
import { ProviderError } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';
import { deriveBookId } from './bookIdentity.js';
import { createBookIfAbsent } from './store.js';
import { logEvent, logFailure } from '../observability.js';
import { parseRequest, requireAuth } from '../callable.js';
import {
  BookSearchQuerySchema,
  GetBookDetailsRequestSchema,
} from './schema.js';
import type { BookMetadata } from '@bookbingo/lib-types';

const provider: BookProvider = new OpenLibraryProvider();

export async function searchBooksHandler(
  request: CallableRequest<unknown>,
): Promise<ProviderSearchResult[]> {
  const uid = requireAuth(request, 'search for books');
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

export async function fetchBookDetailsHandler(
  request: CallableRequest<unknown>,
): Promise<{ bookId: string; title: string; author: string }> {
  const uid = requireAuth(request, 'fetch book details');
  const { externalId } = parseRequest(
    GetBookDetailsRequestSchema,
    request.data,
  );
  const startedAt = Date.now();

  let bookDetails: ProviderBookDetails;
  try {
    bookDetails = await provider.getDetails(externalId);
  } catch (error) {
    logFailure('book.fetch', error, {
      uid,
      externalId,
      outcome: 'error',
      stage: 'provider',
      durationMs: Date.now() - startedAt,
      ...(error instanceof ProviderError
        ? { upstreamStatus: error.status, upstreamUrl: error.url }
        : {}),
    });
    throw toHttpsError(error, 'Could not load book details.');
  }

  let written: { bookId: string; created: boolean };
  try {
    written = await createBookIfAbsent(
      deriveBookId({
        openLibraryKey: bookDetails.externalId,
        title: bookDetails.title,
        author: bookDetails.author,
      }),
      toBookData(bookDetails),
    );
  } catch (error) {
    logFailure('book.fetch', error, {
      uid,
      externalId,
      outcome: 'error',
      stage: 'firestore',
      durationMs: Date.now() - startedAt,
    });
    throw new HttpsError('internal', 'Failed to create book.');
  }

  logEvent('book.fetch', {
    uid,
    externalId,
    outcome: 'ok',
    bookId: written.bookId,
    bookCreated: written.created,
    hasAuthor: bookDetails.author !== '',
    hasPageCount: bookDetails.pageCount !== null,
    durationMs: Date.now() - startedAt,
  });
  return {
    bookId: written.bookId,
    title: bookDetails.title,
    author: bookDetails.author,
  };
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

function toBookData(details: ProviderBookDetails) {
  const metadata: BookMetadata = {
    pageCount: details.pageCount,
    publishedDate: details.publishedDate,
    categories: details.categories,
    language: details.language,
    isbn: details.isbn,
    thumbnailUrl: details.thumbnailUrl,
  };
  const bookData = {
    title: details.title.trim(),
    author: details.author.trim(),
    externalIds: { openLibrary: details.externalId },
    metadata,
  };

  return bookData;
}
