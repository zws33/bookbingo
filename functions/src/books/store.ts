import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import type { Book } from '@bookbingo/lib-types';
import { db } from '../firebase.js';
import { DomainError } from '../common/errors.js';
import { BookDocSchema } from './schema.js';

/**
 * Something pointing at a book document that does not exist.
 *
 * The write paths reject a bookId with no document and books are never
 * deleted, so this means the data is corrupt. `corrupt` keeps the ids out of
 * the response — a placeholder title would hide the corruption behind
 * something that looks like a real row.
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

export interface BookRepository {
  getByIds(ids: string[]): Promise<Map<string, Book>>;
}

/**
 * Reads every book in one `getAll`, keyed by id.
 *
 * Throws `MissingBookError` naming every unresolved id rather than returning
 * what it can: reporting all of them at once makes it one fix instead of a
 * game of whack-a-mole.
 */
async function getBooksById(ids: string[]): Promise<Map<string, Book>> {
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

/**
 * Books are created by `fetchBookDetails` and `createManualBook`, never by a
 * reading write, so naming a book that does not exist is a bug or a forged
 * payload rather than a race.
 */
export async function requireBookExists(
  transaction: Transaction,
  bookId: string,
): Promise<void> {
  const book = await transaction.get(db.collection('books').doc(bookId));
  if (!book.exists) {
    throw new DomainError('not-found', 'That book is not in the catalog.');
  }
}

/** An existing doc at a derived id is the same book, so it is never overwritten. */
export async function createBookIfAbsent(
  bookId: string,
  data: DocumentData,
): Promise<{ bookId: string; created: boolean }> {
  const bookRef = db.collection('books').doc(bookId);

  let created = false;
  await db.runTransaction(async (transaction) => {
    const existingBook = await transaction.get(bookRef);

    if (!existingBook.exists) {
      transaction.set(bookRef, data);
      created = true;
    }
  });

  return { bookId, created };
}

const firestoreBooks: BookRepository = {
  getByIds: getBooksById,
};

export function bookRepository(): BookRepository {
  return firestoreBooks;
}
