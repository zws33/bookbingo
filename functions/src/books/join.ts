import type { Book, BookMetadata } from '@bookbingo/lib-types';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';
import { BookDocSchema } from './schema.js';

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
export class MissingBookError extends DomainError {
  readonly bookIds: string[];

  constructor(bookIds: string[]) {
    super('corrupt', `No book document for: ${bookIds.join(', ')}`, {
      bookIds,
    });
    this.name = 'MissingBookError';
    this.bookIds = bookIds;
  }
}

/**
 * Reads every book in one `getAll`, keyed by id.
 *
 * Throws `MissingBookError` naming every unresolved id rather than returning
 * what it can: reporting all of them at once makes it one fix instead of a
 * game of whack-a-mole. The single place that decides what a missing book
 * means, so every endpoint treats corruption the same way.
 */
export async function fetchBooks(ids: string[]): Promise<Map<string, Book>> {
  const bookIds = [...new Set(ids)];
  if (bookIds.length === 0) return new Map();

  const snapshots = await db.getAll(
    ...bookIds.map((id) => db.collection('books').doc(id)),
  );

  const booksById = new Map<string, Book>();
  const missing: string[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      missing.push(snapshot.id);
      continue;
    }
    const data = BookDocSchema.parse(snapshot.data());
    booksById.set(snapshot.id, {
      id: snapshot.id,
      title: data.title,
      author: data.author,
      metadata: data.metadata,
    });
  }

  if (missing.length > 0) throw new MissingBookError(missing);
  return booksById;
}

/** Joins each item's book, preserving input order. */
export async function withBooks<T extends { bookId: string }>(
  items: T[],
): Promise<(T & BookFields)[]> {
  if (items.length === 0) return [];

  const booksById = await fetchBooks(items.map((item) => item.bookId));

  return items.map((item) => {
    const book = booksById.get(item.bookId);
    if (!book) throw new MissingBookError([item.bookId]);
    return {
      ...item,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookMetadata: book.metadata,
    };
  });
}
