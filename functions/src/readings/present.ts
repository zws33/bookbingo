import type { Book, BookMetadata } from '@bookbingo/lib-types';
import type { Reading } from './store.js';

/**
 * Instants are ISO strings, not Dates: the callable protocol encodes responses
 * as JSON, where a Date would arrive as `{}`.
 */
export interface ReadingDTO {
  id: string;
  bookId: string;
  tiles: string[];
  isFreebie: boolean;
  readAt: string;
  createdAt: string;
  updatedAt?: string;
  bookTitle: string;
  bookAuthor: string;
  bookMetadata: BookMetadata;
}

export function toReadingDTO(reading: Reading & { book: Book }): ReadingDTO {
  return {
    id: reading.id,
    bookId: reading.bookId,
    tiles: reading.tiles,
    isFreebie: reading.isFreebie,
    readAt: reading.readAt.toISOString(),
    createdAt: reading.createdAt.toISOString(),
    ...(reading.updatedAt !== undefined && {
      updatedAt: reading.updatedAt.toISOString(),
    }),
    bookTitle: reading.book.title,
    bookAuthor: reading.book.author,
    bookMetadata: reading.book.metadata,
  };
}
