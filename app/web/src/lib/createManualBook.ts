import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type { BookMetadata } from '@bookbingo/lib-types';
import { EMPTY_METADATA } from '@bookbingo/lib-types';
import { log } from '@bookbingo/lib-util';
import { functions } from './firebase';
import { CreateManualBookResponseSchema } from 'src/types/schemas';

const createManualBookCallable = httpsCallable(functions, 'createManualBook');

/**
 * The callable's error code, e.g. `functions/invalid-argument`. Paired with
 * the `book.manual` event the function logged for the same request.
 */
function errorCode(error: unknown): string {
  const code = (error as Partial<FunctionsError> | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

/**
 * Creates a book from user-entered title/author alone — the failsafe path for
 * when catalog search doesn't find a valid, existing book. The server derives
 * the book id and owns provenance; the client never writes /books directly.
 */
export async function createManualBook(
  title: string,
  author: string,
  metadata: BookMetadata = EMPTY_METADATA,
): Promise<string> {
  const startedAt = Date.now();
  try {
    const result = await createManualBookCallable({ title, author, metadata });
    const parsed = CreateManualBookResponseSchema.parse(result.data);
    log.event('book_manual_create', {
      duration_ms: Date.now() - startedAt,
    });
    return parsed.bookId;
  } catch (error) {
    log.error('createManualBook', error);
    log.event('book_manual_create_error', {
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}
