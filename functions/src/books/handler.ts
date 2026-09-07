import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import type {
  BookSearchResult,
  BookEnrichmentResult,
  BookProvider,
} from './types.js';
import { ProviderError } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';
import { db } from '../firebase.js';
import { logEvent, logFailure } from '../observability.js';

const provider: BookProvider = new OpenLibraryProvider();

const EnrichBookRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('search'), query: z.string().trim().min(1) }),
  z.object({
    action: z.literal('lookup'),
    externalId: z.string().trim().min(1),
  }),
]);

/**
 * Handles book enrichment requests (search or detail lookup).
 */
export async function enrichBookHandler(
  request: CallableRequest<unknown>,
): Promise<BookSearchResult[] | BookEnrichmentResult> {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Must be signed in to search for books.',
    );
  }

  const parsed = EnrichBookRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
  }

  const uid = request.auth.uid;
  const startedAt = Date.now();

  if (parsed.data.action === 'search') {
    try {
      const results = await provider.search(parsed.data.query);
      logEvent('enrich.search', {
        uid,
        outcome: 'ok',
        resultCount: results.length,
        durationMs: Date.now() - startedAt,
      });
      return results;
    } catch (error) {
      logFailure('enrich.search', error, {
        uid,
        outcome: 'error',
        durationMs: Date.now() - startedAt,
      });
      throw toHttpsError(error, 'Book search is unavailable.');
    }
  }

  const externalId = parsed.data.externalId;

  let bookDetails: BookEnrichmentResult;
  try {
    bookDetails = await provider.getDetails(externalId);
  } catch (error) {
    logFailure('enrich.lookup', error, {
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
    written = await createBook(bookDetails);
  } catch (error) {
    logFailure('enrich.lookup', error, {
      uid,
      externalId,
      outcome: 'error',
      stage: 'firestore',
      durationMs: Date.now() - startedAt,
    });
    throw new HttpsError('internal', 'Failed to create book.');
  }

  logEvent('enrich.lookup', {
    uid,
    externalId,
    outcome: 'ok',
    bookId: written.bookId,
    bookCreated: written.created,
    hasAuthor: bookDetails.author !== '',
    hasPageCount: bookDetails.metadata.pageCount !== null,
    durationMs: Date.now() - startedAt,
  });
  return bookDetails;
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

async function createBook(
  enrichment: BookEnrichmentResult,
): Promise<{ bookId: string; created: boolean }> {
  const bookId = createId(enrichment.externalId);
  const bookRef = db.collection('books').doc(bookId);

  let created = false;
  await db.runTransaction(async (transaction) => {
    const existingBook = await transaction.get(bookRef);
    created = !existingBook.exists;
    if (created) {
      transaction.set(
        bookRef,
        {
          title: enrichment.title.trim(),
          author: enrichment.author.trim(),
          externalIds: { openLibrary: enrichment.externalId },
          metadata: enrichment.metadata,
        },
        { merge: true },
      );
    }
  });

  return { bookId, created };
}

function createId(externalId: string): string {
  return hashKey(`openLibrary:${externalId.trim()}`);
}

function hashKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(36);
}
