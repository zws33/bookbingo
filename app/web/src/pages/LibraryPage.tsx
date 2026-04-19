import { useMemo } from 'react';
import { getTileById } from '@bookbingo/lib-core';
import { useBooks } from '../hooks/useBooks';
import { useAllReadings } from '../hooks/useAllReadings';
import { Book } from '../types';

interface BookSummary {
  book: Book;
  readCount: number;
  uniqueTiles: string[];
}

export function LibraryPage() {
  const { booksById, loading: booksLoading, error: booksError } = useBooks();
  const { readingsByUser, loading: readingsLoading, error: readingsError } = useAllReadings();

  const loading = booksLoading || readingsLoading;
  const error = booksError ?? readingsError;

  const bookSummaries = useMemo((): BookSummary[] => {
    const byBook = new Map<string, { readCount: number; tiles: Set<string> }>();

    for (const readings of readingsByUser.values()) {
      for (const reading of readings) {
        if (!reading.bookId) continue;
        const entry = byBook.get(reading.bookId);
        if (entry) {
          entry.readCount += 1;
          reading.tiles.forEach((t) => entry.tiles.add(t));
        } else {
          byBook.set(reading.bookId, {
            readCount: 1,
            tiles: new Set(reading.tiles),
          });
        }
      }
    }

    return [...booksById.values()]
      .map((book) => {
        const stats = byBook.get(book.id);
        return {
          book,
          readCount: stats?.readCount ?? 0,
          uniqueTiles: stats ? [...stats.tiles] : [],
        };
      })
      .sort((a, b) => a.book.title.localeCompare(b.book.title));
  }, [booksById, readingsByUser]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">Error: {error.message}</div>
    );
  }

  if (bookSummaries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No books in the library yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="divide-y divide-gray-100">
        {bookSummaries.map(({ book, readCount, uniqueTiles }) => (
          <div
            key={book.id}
            className="px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{book.title}</p>
                <p className="text-sm text-gray-600 mt-0.5">{book.author}</p>
              </div>
              {readCount > 0 && (
                <span className="text-xs text-gray-500 whitespace-nowrap mt-1 sm:mt-0">
                  {readCount} {readCount === 1 ? 'reader' : 'readers'}
                </span>
              )}
              {uniqueTiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-0">
                  {uniqueTiles.map((tile) => {
                    const name = getTileById(tile)?.name ?? tile;
                    return (
                      <span
                        key={tile}
                        title={name}
                        className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
                      >
                        {name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
