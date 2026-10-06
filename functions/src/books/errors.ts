import { DomainError } from '../common/errors.js';

/**
 * Something pointing at a book that does not exist.
 *
 * The write paths reject a bookId with no record and books are never deleted,
 * so this means the data is corrupt. `corrupt` keeps the ids out of the
 * response — a placeholder title would hide the corruption behind something
 * that looks like a real row.
 *
 * Its own module because the store, `join.ts` and `library/handler.ts` all
 * throw it, so it belongs beside none of them.
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
