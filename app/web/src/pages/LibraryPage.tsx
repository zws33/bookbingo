import { useMemo } from 'react';
import { useBooks } from '../hooks/useBooks';
import { useAllReadings } from '../hooks/useAllReadings';
import { useUsers } from '../hooks/useUsers';
import { Book, UserProfile } from '../types';
import { PageStatus } from '../components/PageStatus';
import { Accordion, Avatar, TileBadge } from '../components/ui';

interface ReaderDetail {
  user: UserProfile;
  tiles: string[];
}

interface BookSummary {
  book: Book;
  readCount: number;
  uniqueTiles: string[];
  readers: ReaderDetail[];
}

export function LibraryPage() {
  const { booksById, loading: booksLoading, error: booksError } = useBooks();
  const {
    readingsByUser,
    loading: readingsLoading,
    error: readingsError,
  } = useAllReadings();
  const { users, loading: usersLoading, error: usersError } = useUsers();

  const loading = booksLoading || readingsLoading || usersLoading;
  const error = booksError ?? readingsError ?? usersError;

  const bookSummaries = useMemo((): BookSummary[] => {
    const usersById = new Map(users.map((u) => [u.id, u]));

    const byBook = new Map<
      string,
      { readCount: number; tiles: Set<string>; readerDetails: { userId: string; tiles: string[] }[] }
    >();

    for (const [userId, readings] of readingsByUser.entries()) {
      for (const reading of readings) {
        if (!reading.bookId) continue;
        const entry = byBook.get(reading.bookId);
        if (entry) {
          entry.readCount += 1;
          reading.tiles.forEach((t) => entry.tiles.add(t));
          entry.readerDetails.push({ userId, tiles: reading.tiles });
        } else {
          byBook.set(reading.bookId, {
            readCount: 1,
            tiles: new Set(reading.tiles),
            readerDetails: [{ userId, tiles: reading.tiles }],
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
          readers: stats
            ? stats.readerDetails
                .map(({ userId, tiles }) => ({ user: usersById.get(userId), tiles }))
                .filter((r): r is ReaderDetail => r.user != null)
            : [],
        };
      })
      .sort((a, b) => a.book.title.localeCompare(b.book.title));
  }, [booksById, readingsByUser, users]);

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
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
      <Accordion.Root type="multiple">
        {bookSummaries.map(({ book, readCount, uniqueTiles, readers }) => (
          <Accordion.Item key={book.id} value={book.id}>
            <Accordion.Trigger>
              <div className="flex flex-1 flex-col sm:flex-row sm:items-center sm:gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{book.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{book.author}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
                  {readCount > 0 && (
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {readCount} {readCount === 1 ? 'reader' : 'readers'}
                    </span>
                  )}
                  {uniqueTiles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {uniqueTiles.map((tileId) => (
                        <TileBadge key={tileId} tileId={tileId} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Accordion.Trigger>
            {readers.length > 0 && (
              <Accordion.Content>
                <ul className="px-4 pb-3 space-y-2">
                  {readers.map(({ user, tiles }) => (
                    <li key={user.id} className="flex items-start gap-2">
                      <Avatar name={user.name} photoURL={user.photoURL ?? undefined} size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{user.name}</p>
                        {tiles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tiles.map((tileId) => (
                              <TileBadge key={tileId} tileId={tileId} variant="secondary" />
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Accordion.Content>
            )}
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
}
