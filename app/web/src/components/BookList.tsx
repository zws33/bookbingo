import { useState, useMemo } from 'react';
import type { Reading, BookMetadata } from '@bookbingo/lib-types';
import { BookCard } from './BookCard';
import { BookRow } from './BookRow';
import { Dialog, AlertDialog, ToggleGroup } from './ui/index.js';
import { BookForm, type BookFormData } from './BookForm';
import { EmptyState } from './EmptyState';
import { SearchFilter } from './SearchFilter';
import { useToast } from '../lib/ToastContext';
import { updateReading, deleteReading } from '../data/readings';
import { log } from '@bookbingo/lib-util';
import { PageStatus } from './PageStatus';
import { useBooksByIds } from '../hooks/useBooksByIds';

interface BookListProps {
  userId: string;
  readings: Reading[];
  loading: boolean;
  error?: Error | undefined;
  readOnly?: boolean;
}

const UNKNOWN_BOOK = { title: 'Unknown Book', author: 'Unknown Author' };

interface ReadingWithBook extends Reading {
  bookTitle: string;
  bookAuthor: string;
  bookThumbnailUrl: string | null;
  bookMetadata: BookMetadata | undefined;
}

export function BookList({
  userId,
  readings,
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

  const bookIds = useMemo(
    () => readings.map((reading) => reading.bookId),
    [readings],
  );
  const { booksById } = useBooksByIds(bookIds);

  const readingsWithBook = useMemo<ReadingWithBook[]>(
    () =>
      readings.map((r) => {
        const book = booksById.get(r.bookId);
        return {
          ...r,
          bookTitle: book?.title ?? r.bookTitle ?? UNKNOWN_BOOK.title,
          bookAuthor: book?.author ?? r.bookAuthor ?? UNKNOWN_BOOK.author,
          bookThumbnailUrl: book?.metadata.thumbnailUrl ?? null,
          bookMetadata: book?.metadata,
        };
      }),
    [readings, booksById],
  );

  const filteredReadings = useMemo(() => {
    if (!authorFilter.trim()) return readingsWithBook;
    const filter = authorFilter.toLowerCase();
    return readingsWithBook.filter((r) => {
      return r.bookAuthor.toLowerCase().includes(filter);
    });
  }, [readingsWithBook, authorFilter]);

  const handleEdit = async (data: BookFormData) => {
    if (!selectedReading) return;
    setIsSubmitting(true);
    try {
      await updateReading(
        userId,
        selectedReading.id,
        selectedReading.bookId,
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

  const selectedReadingWithBook = selectedReading
    ? readingsWithBook.find((r) => r.id === selectedReading.id)
    : undefined;
  const selectedBook = {
    title: selectedReadingWithBook?.bookTitle ?? UNKNOWN_BOOK.title,
    author: selectedReadingWithBook?.bookAuthor ?? UNKNOWN_BOOK.author,
  };

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
            return (
              <BookCard
                key={reading.id}
                bookTitle={reading.bookTitle}
                bookAuthor={reading.bookAuthor}
                thumbnailUrl={reading.bookThumbnailUrl}
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
            return (
              <BookRow
                key={reading.id}
                bookTitle={reading.bookTitle}
                bookAuthor={reading.bookAuthor}
                metadata={reading.bookMetadata}
                tiles={reading.tiles}
                isFreebie={reading.isFreebie}
                onClick={() => setSelectedReading(reading)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}

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
    </div>
  );
}
