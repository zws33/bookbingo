import type { Book } from '@bookbingo/lib-types';
import { MissingBookError, type BookRepository } from './store.js';

/**
 * Attaches each item's book in one batched read, preserving input order.
 *
 * Generic so readings and TBR entries share the single `getAll` — resolving
 * books per item would turn one read into N.
 */
export async function attachBooks<T extends { bookId: string }>(
  booksRepo: BookRepository,
  items: T[],
): Promise<(T & { book: Book })[]> {
  if (items.length === 0) return [];

  const booksById = await booksRepo.getByIds(items.map((item) => item.bookId));

  return items.map((item) => {
    const book = booksById.get(item.bookId);
    if (!book) throw new MissingBookError([item.bookId]);
    return { ...item, book };
  });
}
