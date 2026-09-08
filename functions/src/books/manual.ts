import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import z from 'zod/v4';
import { db } from '../firebase.js';
import { logEvent, logFailure } from '../observability.js';
import { BookMetadataSchema } from '@bookbingo/lib-types';

const CreateManualBookRequestSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  metadata: BookMetadataSchema,
});

export type CreateManualBookRequest = z.infer<
  typeof CreateManualBookRequestSchema
>;

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

  const uid = request.auth.uid;
  const startedAt = Date.now();

  try {
    const created = await db.collection('books').add(parsed.data);
    logEvent('book.manual', {
      uid,
      outcome: 'ok',
      bookId: created.id,
      hasPageCount: parsed.data.metadata.pageCount !== null,
      hasPublishedDate: parsed.data.metadata.publishedDate !== null,
      hasCategories: parsed.data.metadata.categories.length > 0,
      hasLanguage: parsed.data.metadata.language !== null,
      hasThumbnailUrl: parsed.data.metadata.thumbnailUrl !== null,
      durationMs: Date.now() - startedAt,
    });
    return { bookId: created.id };
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
