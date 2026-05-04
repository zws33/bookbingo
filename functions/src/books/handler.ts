import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { BookEnrichmentService } from './service.js';
import { BookSearchResult, BookEnrichmentResult } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';

const provider = new OpenLibraryProvider();
const service = new BookEnrichmentService(provider);

type EnrichBookAction = 'search' | 'lookup';

interface EnrichBookData {
  action: EnrichBookAction;
  query?: string;
  externalId?: string;
}

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

  const data = request.data as EnrichBookData;
  const { action, query, externalId } = data;

  if (action === 'search') {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'query is required for search action.',
      );
    }
    return service.searchBooks(query);
  }

  if (action === 'lookup') {
    if (
      !externalId ||
      typeof externalId !== 'string' ||
      externalId.trim().length === 0
    ) {
      throw new HttpsError(
        'invalid-argument',
        'externalId is required for lookup action.',
      );
    }
    try {
      return await service.getBookDetails(externalId);
    } catch (error) {
      throw new HttpsError('not-found', (error as Error).message);
    }
  }

  throw new HttpsError(
    'invalid-argument',
    'Invalid action. Must be "search" or "lookup".',
  );
}
