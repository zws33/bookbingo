import { toDomainError, type ConstraintMessages } from '../common/pgErrors.js';
import { getPool } from '../db/pool.js';
import { inTransaction, type Db } from '../db/transaction.js';
import { MissingBookError } from './errors.js';

/**
 * A book as stored: global, challenge-agnostic, and carrying no catalog
 * metadata beyond the cover. The five metadata fields were dropped — unread by
 * the app and absent from the schema.
 */
export interface Book {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string | null;
}

export interface NewBook extends Book {
  /** `null` for a book sourced from a provider rather than entered by hand. */
  createdBy: string | null;
}

/** A book's identity in an external catalog. `details` is carried back to that provider. */
export interface BookExternalRef {
  source: string;
  externalId: string;
  details: Record<string, unknown>;
}

export interface BookRepository {
  getByIds(ids: string[]): Promise<Map<string, Book>>;
  findByExternalRef(
    source: string,
    externalId: string,
  ): Promise<Book | undefined>;
  createIfAbsent(
    book: NewBook,
    refs?: BookExternalRef[],
  ): Promise<{ bookId: string; created: boolean }>;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  thumbnail_url: string | null;
}

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    thumbnailUrl: row.thumbnail_url,
  };
}

const COLUMNS = 'id, title, author, thumbnail_url';

const WRITE_ERRORS: ConstraintMessages = {
  books_created_by_fkey: ['not-found', 'That user no longer exists.'],
  books_title_check: ['invalid-input', 'Title and author are required.'],
  books_author_check: ['invalid-input', 'Title and author are required.'],
  // A derived id always maps to the same book, so a second book claiming an
  // external id means the derivation changed. `corrupt` keeps the ids out of
  // the response.
  book_external_refs_source_external_id_key: [
    'corrupt',
    'That catalog id already points at a different book.',
  ],
};

export function bookRepository(db: Db = getPool()): BookRepository {
  return {
    /**
     * Reads every book in one statement, keyed by id. Throws
     * `MissingBookError` naming every unresolved id at once, rather than
     * returning what it can.
     */
    async getByIds(ids) {
      const bookIds = [...new Set(ids)];
      if (bookIds.length === 0) return new Map();

      const { rows } = await db.query<BookRow>(
        `select ${COLUMNS} from books where id = any($1::text[])`,
        [bookIds],
      );

      const booksById = new Map(rows.map((row) => [row.id, toBook(row)]));
      const missing = bookIds.filter((id) => !booksById.has(id));
      if (missing.length > 0) throw new MissingBookError(missing);

      return booksById;
    },

    async findByExternalRef(source, externalId) {
      const { rows } = await db.query<BookRow>(
        `select ${COLUMNS.split(', ')
          .map((column) => `b.${column}`)
          .join(', ')}
           from books b
           join book_external_refs r on r.book_id = b.id
          where r.source = $1 and r.external_id = $2`,
        [source, externalId],
      );
      const row = rows[0];
      return row ? toBook(row) : undefined;
    },

    /**
     * An existing row at a derived id is the same book, so it is never
     * overwritten. The refs go in the same transaction: a book with no external
     * ref cannot be matched to its provider again.
     */
    async createIfAbsent(book, refs = []) {
      try {
        return await inTransaction(db, async (client) => {
          const { rowCount } = await client.query(
            `insert into books (id, title, author, thumbnail_url, created_by)
             values ($1, $2, $3, $4, $5)
             on conflict (id) do nothing`,
            [
              book.id,
              book.title,
              book.author,
              book.thumbnailUrl,
              book.createdBy,
            ],
          );

          for (const ref of refs) {
            await client.query(
              `insert into book_external_refs (book_id, source, external_id, details)
               values ($1, $2, $3, $4)
               on conflict (book_id, source, external_id) do nothing`,
              [book.id, ref.source, ref.externalId, ref.details],
            );
          }

          return { bookId: book.id, created: rowCount === 1 };
        });
      } catch (error) {
        throw toDomainError(error, { constraints: WRITE_ERRORS });
      }
    },
  };
}
