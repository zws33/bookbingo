import type { Book } from '@bookbingo/lib-types';
import { createCallable } from '../lib/callable';
import { GetBooksResponseSchema } from '../types/schemas';

const getBooksCallable = createCallable<{ ids: string[] }, Book[]>(
  'getBooks',
  GetBooksResponseSchema,
);

/**
 * Fetches exactly the books referenced by `bookIds`.
 *
 * Ids with no book come back missing rather than as an error; callers render a
 * placeholder for a reading whose book document is gone.
 */
export async function getBooksById(bookIds: string[]): Promise<Book[]> {
  const ids = [...new Set(bookIds)];
  if (ids.length === 0) return [];
  return getBooksCallable({ ids });
}
