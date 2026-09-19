import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Book } from '@bookbingo/lib-types';
import { logEvent, logFailure } from '../observability.js';
import { parseRequest, requireAuth } from '../callable.js';
import { deriveBookId, normalizeForKey } from './bookIdentity.js';
import { CreateManualBookRequestSchema } from './schema.js';
import { createBookIfAbsent } from './store.js';

export async function createManualBookHandler(
  request: CallableRequest<unknown>,
): Promise<Book> {
  const { uid } = requireAuth(request, 'add a book');
  const book = parseRequest(CreateManualBookRequestSchema, request.data);

  const { title, author, metadata } = book;
  // Punctuation-only input normalizes to an empty key shared by every such book.
  if (normalizeForKey(title) === '' || normalizeForKey(author) === '') {
    throw new HttpsError(
      'invalid-argument',
      'Title and author must contain at least one letter or digit.',
    );
  }

  const startedAt = Date.now();

  try {
    const written = await createBookIfAbsent(
      deriveBookId({ title, author }),
      book,
    );
    logEvent('book.manual', {
      uid,
      outcome: 'ok',
      bookId: written.bookId,
      bookCreated: written.created,
      hasPageCount: metadata.pageCount !== null,
      hasPublishedDate: metadata.publishedDate !== null,
      hasCategories: metadata.categories.length > 0,
      hasLanguage: metadata.language !== null,
      hasThumbnailUrl: metadata.thumbnailUrl !== null,
      durationMs: Date.now() - startedAt,
    });
    return { id: written.bookId, title, author, metadata };
  } catch (error) {
    logFailure('book.manual', error, {
      uid,
      outcome: 'error',
      stage: 'firestore',
      durationMs: Date.now() - startedAt,
    });
    throw new HttpsError('internal', 'Failed to create book.');
  }
}
