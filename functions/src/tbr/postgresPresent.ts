import type { Book } from '../books/postgresStore.js';
import type { TBREntry } from './postgresStore.js';

/** Instants are ISO strings for the same reason as ReadingDTO. */
export interface TBREntryDTO {
  id: string;
  userId: string;
  bookId: string;
  plannedTagIds: string[];
  notes?: string;
  addedAt: string;
  updatedAt?: string;
  book: Book;
}

export function toTBREntryDTO(entry: TBREntry & { book: Book }): TBREntryDTO {
  return {
    id: entry.id,
    userId: entry.userId,
    bookId: entry.bookId,
    plannedTagIds: entry.plannedTagIds,
    ...(entry.notes !== undefined && { notes: entry.notes }),
    addedAt: entry.addedAt.toISOString(),
    ...(entry.updatedAt !== undefined && {
      updatedAt: entry.updatedAt.toISOString(),
    }),
    book: entry.book,
  };
}
