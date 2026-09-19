import type { BookMetadata } from '@bookbingo/lib-types';
import { db } from '../firebase.js';
import { BookDocSchema } from '../schemas.js';

/** The book fields the UI renders, joined onto anything holding a `bookId`. */
export interface BookFields {
  bookTitle: string;
  bookAuthor: string;
  bookMetadata: BookMetadata;
}

/**
 * Something pointing at a book document that does not exist.
 *
 * The write paths reject a bookId with no document and books are never
 * deleted, so this means the data is corrupt. Callers turn it into an
 * `internal` error rather than papering over it with a placeholder title,
 * which would hide the corruption behind something that looks like a real row.
 */
export class MissingBookError extends Error {
  readonly bookIds: string[];

  constructor(bookIds: string[]) {
    super(`No book document for: ${bookIds.join(', ')}`);
    this.name = 'MissingBookError';
    this.bookIds = bookIds;
  }
}

/**
 * Joins each item's book in one `getAll` over the distinct ids, preserving
 * input order.
 *
 * Throws `MissingBookError` naming every unresolved id rather than resolving
 * what it can: reporting all of them at once makes it one fix instead of a
 * game of whack-a-mole.
 */
export async function withBooks<T extends { bookId: string }>(
  items: T[],
): Promise<(T & BookFields)[]> {
  if (items.length === 0) return [];

  const bookIds = [...new Set(items.map((item) => item.bookId))];
  const snapshots = await db.getAll(
    ...bookIds.map((id) => db.collection('books').doc(id)),
  );

  const booksById = new Map<string, BookFields>();
  const missing: string[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      missing.push(snapshot.id);
      continue;
    }
    const book = BookDocSchema.parse(snapshot.data());
    booksById.set(snapshot.id, {
      bookTitle: book.title,
      bookAuthor: book.author,
      bookMetadata: book.metadata,
    });
  }

  if (missing.length > 0) throw new MissingBookError(missing);

  return items.map((item) => {
    const book = booksById.get(item.bookId);
    if (!book) throw new MissingBookError([item.bookId]);
    return { ...item, ...book };
  });
}
