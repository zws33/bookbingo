import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Book } from '@bookbingo/lib-types';
import z from 'zod/v4';
import { db } from '../firebase.js';
import { parseRequest, requireAuth } from '../callable.js';
import { BookDocSchema } from '../schemas.js';
import { logWarning } from '../observability.js';

/** Bounds the work one call can ask for; a user's library is far below this. */
const MAX_IDS_PER_REQUEST = 1000;

const GetBooksRequestSchema = z.object({
  ids: z.array(z.string().min(1)).max(MAX_IDS_PER_REQUEST),
});

/**
 * Fetches exactly the books referenced by `ids`.
 *
 * One `getAll` for the whole set. The client chunked by 30 because
 * `documentId() in` caps there; the Admin SDK reads by reference through
 * BatchGetDocuments, which has no such cap, and chunking would only add
 * sequential round trips. `MAX_IDS_PER_REQUEST` is what bounds the work.
 *
 * Ids with no document are omitted rather than erroring: a reading can outlive
 * its book document, and the caller renders a placeholder.
 */
export async function getBooksHandler(
  request: CallableRequest<unknown>,
): Promise<Book[]> {
  requireAuth(request, 'load books');
  const { ids } = parseRequest(GetBooksRequestSchema, request.data);

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const snapshots = await db.getAll(
    ...uniqueIds.map((id) => db.collection('books').doc(id)),
  );

  const books: Book[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    try {
      books.push(toBook(snapshot.id, snapshot.data()));
    } catch (error) {
      logWarning('document.invalid', error, {
        label: 'books',
        path: snapshot.ref.path,
      });
    }
  }

  return books;
}

function toBook(id: string, raw: unknown): Book {
  const data = BookDocSchema.parse(raw);
  return {
    id,
    title: data.title,
    author: data.author,
    metadata: data.metadata,
  };
}
