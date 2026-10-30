import { httpsCallable } from 'firebase/functions';
import { log } from '@bookbingo/lib-util';
import { errorCode } from './callable';
import { functions } from './firebase';
import { BookResponseSchema, type Book } from '../types/schemas';

const createManualBookCallable = httpsCallable(functions, 'createManualBookV2');

/**
 * Creates a book from user-entered title/author alone — the failsafe path for
 * when catalog search doesn't find a valid, existing book. The server derives
 * the book id and owns provenance; the client never writes books directly.
 */
export async function createManualBook(
  title: string,
  author: string,
  thumbnailUrl: string | null = null,
): Promise<Book> {
  const startedAt = Date.now();
  try {
    const result = await createManualBookCallable({
      title,
      author,
      thumbnailUrl,
    });
    const parsed = BookResponseSchema.parse(result.data);
    log.event('book_manual_create', {
      duration_ms: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    log.error('createManualBook', error);
    log.event('book_manual_create_error', {
      code: errorCode(error),
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}
