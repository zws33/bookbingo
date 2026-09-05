import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import { BookEnrichmentService } from './service.js';
import type { BookSearchResult, BookEnrichmentResult } from './types.js';
import { OpenLibraryProvider } from './providers/open-library.js';

const provider = new OpenLibraryProvider();
const service = new BookEnrichmentService(provider);

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

  if (parsed.data.action === 'search') {
    return service.searchBooks(parsed.data.query);
  }

  try {
    return await service.getBookDetails(parsed.data.externalId);
  } catch (error) {
    throw new HttpsError('not-found', (error as Error).message);
  }
}
