import { MissingBookError } from './errors.js';

/**
 * Attaches each item's book in one batched read, preserving input order.
 *
 * Generic so readings and TBR entries share the single `getAll` — resolving
 * books per item would turn one read into N.
 *
 * `B` is inferred from the repository rather than fixed, because the Firestore
 * and Postgres `Book` entities differ.
 */
export async function attachBooks<T extends { bookId: string }, B>(
  booksRepo: { getByIds(ids: string[]): Promise<Map<string, B>> },
  items: T[],
): Promise<(T & { book: B })[]> {
  if (items.length === 0) return [];

  const booksById = await booksRepo.getByIds(items.map((item) => item.bookId));

  return items.map((item) => {
    const book = booksById.get(item.bookId);
    if (!book) throw new MissingBookError([item.bookId]);
    return { ...item, book };
  });
}
