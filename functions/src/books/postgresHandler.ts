import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { parseRequest, requireAuth } from '../callable.js';
import { logEvent, logFailure } from '../observability.js';
import { deriveBookId, normalizeForKey } from './bookIdentity.js';
import type { Book, BookRepository } from './postgresStore.js';
import { OpenLibraryProvider } from './providers/open-library.js';
import {
  CreateManualBookV2RequestSchema,
  GetBookDetailsRequestSchema,
} from './schema.js';
import { ProviderError, type BookProvider } from './types.js';

export const OPEN_LIBRARY = 'openLibrary';

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

/**
 * Books are global, not challenge-scoped (rule 2), so neither method takes a
 * `challengeId` or checks a membership. Being signed in is the whole bar.
 */
export function bookHandlers(
  booksRepo: BookRepository,
  provider: BookProvider = new OpenLibraryProvider(),
) {
  return {
    /**
     * Ensures the catalog book exists and returns it whole.
     *
     * The client renders the book straight from this response, so returning
     * only an id would mean a second round trip to read back what was just
     * written.
     */
    async fetchDetails(request: CallableRequest<unknown>): Promise<Book> {
      const { uid } = requireAuth(request, 'fetch book details');
      const { externalId } = parseRequest(
        GetBookDetailsRequestSchema,
        request.data,
      );
      const startedAt = Date.now();

      let details;
      try {
        details = await provider.getDetails(externalId);
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

      const book: Book = {
        id: deriveBookId({
          openLibraryKey: details.externalId,
          title: details.title,
          author: details.author,
        }),
        title: details.title.trim(),
        author: details.author.trim(),
        thumbnailUrl: details.thumbnailUrl,
      };

      let written: { bookId: string; created: boolean };
      try {
        written = await booksRepo.createIfAbsent(
          // Not the caller: a provider book is nobody's entry.
          { ...book, createdBy: null },
          [
            {
              source: OPEN_LIBRARY,
              externalId: details.externalId,
              details: {},
            },
          ],
        );
      } catch (error) {
        logFailure('book.fetch', error, {
          uid,
          externalId,
          outcome: 'error',
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
        hasAuthor: details.author !== '',
        durationMs: Date.now() - startedAt,
      });
      return book;
    },

    async createManual(request: CallableRequest<unknown>): Promise<Book> {
      const { uid } = requireAuth(request, 'add a book');
      const { title, author, thumbnailUrl } = parseRequest(
        CreateManualBookV2RequestSchema,
        request.data,
      );

      // Punctuation-only input normalizes to an empty key shared by every
      // such book.
      if (normalizeForKey(title) === '' || normalizeForKey(author) === '') {
        throw new HttpsError(
          'invalid-argument',
          'Title and author must contain at least one letter or digit.',
        );
      }

      const startedAt = Date.now();
      const book: Book = {
        id: deriveBookId({ title, author }),
        title,
        author,
        thumbnailUrl,
      };

      try {
        const written = await booksRepo.createIfAbsent({
          ...book,
          createdBy: uid,
        });
        logEvent('book.manual', {
          uid,
          outcome: 'ok',
          bookId: written.bookId,
          bookCreated: written.created,
          hasThumbnailUrl: thumbnailUrl !== null,
          durationMs: Date.now() - startedAt,
        });
        return book;
      } catch (error) {
        logFailure('book.manual', error, {
          uid,
          outcome: 'error',
          durationMs: Date.now() - startedAt,
        });
        throw new HttpsError('internal', 'Failed to create book.');
      }
    },
  };
}
