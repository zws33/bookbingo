import type { Book, BookMetadata } from '@bookbingo/lib-types';
import type { TBREntry } from './store.js';

/** Instants are ISO strings for the same reason as ReadingDTO. */
export interface TBREntryDTO {
  id: string;
  bookId: string;
  plannedTiles: string[];
  notes?: string;
  addedAt: string;
  updatedAt?: string;
  bookTitle: string;
  bookAuthor: string;
  bookMetadata: BookMetadata;
}

export function toTBREntryDTO(entry: TBREntry & { book: Book }): TBREntryDTO {
  return {
    id: entry.id,
    bookId: entry.bookId,
    plannedTiles: entry.plannedTiles,
    ...(entry.notes !== undefined && { notes: entry.notes }),
    addedAt: entry.addedAt.toISOString(),
    ...(entry.updatedAt !== undefined && {
      updatedAt: entry.updatedAt.toISOString(),
    }),
    bookTitle: entry.book.title,
    bookAuthor: entry.book.author,
    bookMetadata: entry.book.metadata,
  };
}
