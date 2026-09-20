import { useLibrary } from '../hooks/useLibrary';
import { PageStatus } from '../components/PageStatus';
import { Accordion, Avatar, TileBadge } from '../components/ui';

export function LibraryPage() {
  const { books, loading, error } = useLibrary();

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-8 text-on-surface-variant">
        No books in the library yet.
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow overflow-hidden">
      <Accordion.Root type="multiple">
        {books.map(({ book, readCount, uniqueTiles, readers }) => (
          <Accordion.Item key={book.id} value={book.id}>
            <Accordion.Trigger>
              <div className="flex flex-1 flex-col sm:flex-row sm:items-center sm:gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-medium text-on-surface">
                    {book.title}
                  </p>
                  <p className="text-sm italic text-on-surface-variant mt-0.5">
                    {book.author}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
                  {readCount > 0 && (
                    <span className="text-xs text-on-surface-variant whitespace-nowrap">
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
                  {readers.map(({ userId, name, photoURL, tiles }) => (
                    <li key={userId} className="flex items-start gap-2">
                      <Avatar
                        name={name}
                        photoURL={photoURL ?? undefined}
                        size="sm"
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface">
                          {name}
                        </p>
                        {tiles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {tiles.map((tileId) => (
                              <TileBadge
                                key={tileId}
                                tileId={tileId}
                                variant="secondary"
                              />
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
