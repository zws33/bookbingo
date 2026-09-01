import { useState, useMemo } from 'react';
import type { Reading, Book } from '@bookbingo/lib-types';
import { BookCard } from './BookCard';
import { BookRow } from './BookRow';
import { Dialog, AlertDialog, ToggleGroup } from './ui/index.js';
import { BookForm, type BookFormData } from './BookForm';
import { EmptyState } from './EmptyState';
import { SearchFilter } from './SearchFilter';
import { useToast } from '../lib/ToastContext';
import { getOrCreateBook, updateReading, deleteReading } from '../lib/books';
import { log } from '@bookbingo/lib-util';
import { PageStatus } from './PageStatus';

interface BookListProps {
  userId: string;
  readings: Reading[];
  booksById: Map<string, Book>;
  loading: boolean;
  error?: Error | undefined;
  readOnly?: boolean;
}

const UNKNOWN_BOOK = { title: 'Unknown Book', author: 'Unknown Author' };

export function BookList({
  userId,
  readings,
  booksById,
  loading,
  error,
  readOnly = false,
}: BookListProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [authorFilter, setAuthorFilter] = useState('');
  const [selectedReading, setSelectedReading] = useState<Reading | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showSuccess, showError: showErrorToast } = useToast();

  const filteredReadings = useMemo(() => {
    if (!authorFilter.trim()) return readings;
    const filter = authorFilter.toLowerCase();
    return readings.filter((r) => {
      const book = booksById.get(r.bookId) ?? UNKNOWN_BOOK;
      return book.author.toLowerCase().includes(filter);
    });
  }, [readings, authorFilter, booksById]);

  const handleEdit = async (data: BookFormData) => {
    if (!selectedReading) return;
    setIsSubmitting(true);
    try {
      const bookId = await getOrCreateBook(data.title, data.author, userId);
      await updateReading(
        userId,
        selectedReading.id,
        bookId,
        data.tiles,
        data.isFreebie,
      );
      showSuccess('Book updated successfully');
      setSelectedReading(null);
    } catch (err) {
      showErrorToast('Failed to update book');
      log.error('Update book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReading) return;
    setIsSubmitting(true);
    try {
      await deleteReading(userId, selectedReading.id);
      showSuccess('Book deleted successfully');
      setShowDeleteConfirm(false);
      setSelectedReading(null);
    } catch (err) {
      showErrorToast('Failed to delete book');
      log.error('Delete book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  const selectedBookData = selectedReading
    ? booksById.get(selectedReading.bookId)
    : undefined;
  const selectedBook = selectedBookData ?? UNKNOWN_BOOK;

  return (
    <div className="space-y-4">
      {readings.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchFilter value={authorFilter} onChange={setAuthorFilter} />
          </div>
          <ToggleGroup.Root
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) setViewMode(value as 'cards' | 'list');
            }}
          >
            <ToggleGroup.Item
              value="cards"
              aria-label="Card view"
              title="Card view"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="list"
              aria-label="List view"
              title="List view"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
      )}

      {filteredReadings.length === 0 ? (
        readings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="text-center py-8 text-on-surface-variant">
            No books match your filter.
          </div>
        )
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredReadings.map((reading) => {
            const book = booksById.get(reading.bookId);
            return (
              <BookCard
                key={reading.id}
                bookTitle={book?.title ?? 'Unknown Book'}
                bookAuthor={book?.author ?? 'Unknown Author'}
                metadata={book?.metadata}
                tiles={reading.tiles}
                onClick={() => setSelectedReading(reading)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-outline-variant bg-surface-container-lowest rounded-lg shadow">
          {filteredReadings.map((reading) => {
            const book = booksById.get(reading.bookId);
            return (
              <BookRow
                key={reading.id}
                bookTitle={book?.title ?? 'Unknown Book'}
                bookAuthor={book?.author ?? 'Unknown Author'}
                metadata={book?.metadata}
                tiles={reading.tiles}
                isFreebie={reading.isFreebie}
                onClick={() => setSelectedReading(reading)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}

      {readOnly ? (
        <Dialog
          isOpen={!!selectedReading}
          onClose={() => setSelectedReading(null)}
          title={selectedBook.title}
        >
          <div className="space-y-4">
            <div className="flex gap-4">
              {selectedBookData?.metadata?.thumbnailUrl && (
                <img
                  src={selectedBookData.metadata.thumbnailUrl}
                  alt=""
                  className="w-16 h-22 object-cover rounded-sm shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      'none';
                  }}
                />
              )}
              <div className="space-y-1">
                <p className="italic text-on-surface-variant">
                  {selectedBook.author}
                </p>
                {selectedBookData?.metadata?.publishedDate && (
                  <p className="text-sm text-on-surface-variant">
                    {selectedBookData.metadata.publishedDate}
                  </p>
                )}
                {selectedBookData?.metadata?.pageCount && (
                  <p className="text-sm text-on-surface-variant">
                    {selectedBookData.metadata.pageCount} pages
                  </p>
                )}
              </div>
            </div>
            {selectedBookData?.metadata?.categories &&
              selectedBookData.metadata.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedBookData.metadata.categories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-sm"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            {selectedReading && selectedReading.tiles.length > 0 && (
              <div className="pt-2 border-t border-outline-variant">
                <p className="text-xs text-on-surface-variant mb-1">
                  Bingo tiles
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedReading.tiles.map((tile) => (
                    <span
                      key={tile}
                      className="w-2 h-2 rounded-sm bg-primary inline-block"
                      title={tile}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Dialog>
      ) : (
        <>
          <Dialog
            isOpen={!!selectedReading && !showDeleteConfirm}
            onClose={() => setSelectedReading(null)}
            title="Edit Book"
          >
            <BookForm
              identityLocked
              initialData={{
                title: selectedBook.title,
                author: selectedBook.author,
                tiles: selectedReading?.tiles ?? [],
                isFreebie: selectedReading?.isFreebie ?? false,
              }}
              onSubmit={handleEdit}
              onCancel={() => setSelectedReading(null)}
              isSubmitting={isSubmitting}
            />
            <div className="mt-4 pt-4 border-t border-outline-variant flex justify-center">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-error hover:text-error/90"
                disabled={isSubmitting}
              >
                Delete this reading
              </button>
            </div>
          </Dialog>

          <AlertDialog
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDelete}
            title="Delete Book"
            message={`Are you sure you want to delete "${selectedBook.title}"? This action cannot be undone.`}
            confirmLabel="Delete"
          />
        </>
      )}
    </div>
  );
}
