import type { Book } from '../books/postgresStore.js';
import type { Reading } from './postgresStore.js';

/**
 * Instants are ISO strings, not Dates: the callable protocol encodes responses
 * as JSON, where a Date would arrive as `{}`.
 */
export interface ReadingDTO {
  id: string;
  userId: string;
  bookId: string;
  tagIds: string[];
  isFreebie: boolean;
  readAt: string;
  createdAt: string;
  updatedAt?: string;
  book: Book;
}

export function toReadingDTO(reading: Reading & { book: Book }): ReadingDTO {
  return {
    id: reading.id,
    userId: reading.userId,
    bookId: reading.bookId,
    tagIds: reading.tagIds,
    isFreebie: reading.isFreebie,
    readAt: reading.readAt.toISOString(),
    createdAt: reading.createdAt.toISOString(),
    ...(reading.updatedAt !== undefined && {
      updatedAt: reading.updatedAt.toISOString(),
    }),
    book: reading.book,
  };
}
