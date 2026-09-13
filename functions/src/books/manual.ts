import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import { logEvent, logFailure } from '../observability.js';
import { deriveBookId, normalizeForKey } from './bookIdentity.js';
import { CreateManualBookRequestSchema } from './schema.js';
import { createBookIfAbsent } from './store.js';

export async function createManualBookHandler(
  request: CallableRequest<unknown>,
): Promise<{ bookId: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in to add a book.');
  }

  const parsed = CreateManualBookRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', z.prettifyError(parsed.error));
  }

  const { title, author } = parsed.data;
  // Punctuation-only input normalizes to an empty key shared by every such book.
  if (normalizeForKey(title) === '' || normalizeForKey(author) === '') {
    throw new HttpsError(
      'invalid-argument',
      'Title and author must contain at least one letter or digit.',
    );
  }

  const uid = request.auth.uid;
  const startedAt = Date.now();

  try {
    const written = await createBookIfAbsent(
      deriveBookId({ title, author }),
      parsed.data,
    );
    logEvent('book.manual', {
      uid,
      outcome: 'ok',
      bookId: written.bookId,
      bookCreated: written.created,
      hasPageCount: parsed.data.metadata.pageCount !== null,
      hasPublishedDate: parsed.data.metadata.publishedDate !== null,
      hasCategories: parsed.data.metadata.categories.length > 0,
      hasLanguage: parsed.data.metadata.language !== null,
      hasThumbnailUrl: parsed.data.metadata.thumbnailUrl !== null,
      durationMs: Date.now() - startedAt,
    });
    return { bookId: written.bookId };
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
