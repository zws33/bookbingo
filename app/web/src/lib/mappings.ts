import type { Reading, UserBook } from '@bookbingo/lib-types';

/**
 * Maps Firestore Reading objects to UserBook objects used by the scoring engine.
 */
export function mapReadingsToUserBooks(
  readings: Reading[],
  userId: string,
): UserBook[] {
  return readings.map((reading) => ({
    id: reading.id,
    userId: userId,
    title: reading.bookTitle,
    author: reading.bookAuthor,
    tiles: reading.tiles,
    isFreebie: reading.isFreebie,
    readAt: reading.readAt,
  }));
}
