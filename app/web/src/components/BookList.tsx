import { useState, useMemo } from 'react';
import type { Reading, Book } from '../types';
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
  error?: Error;
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

  const selectedBook = selectedReading
    ? (booksById.get(selectedReading.bookId) ?? UNKNOWN_BOOK)
    : UNKNOWN_BOOK;

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
            onValueChange={(value) => { if (value) setViewMode(value as 'cards' | 'list'); }}
          >
            <ToggleGroup.Item value="cards" aria-label="Card view" title="Card view">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="list" aria-label="List view" title="List view">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
      )}

      {filteredReadings.length === 0 ? (
        readings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="text-center py-8 text-gray-500">
            No books match your filter.
          </div>
        )
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredReadings.map((reading) => {
            const book = booksById.get(reading.bookId) ?? UNKNOWN_BOOK;
            return (
              <BookCard
                key={reading.id}
                bookTitle={book.title}
                bookAuthor={book.author}
                tiles={reading.tiles}
                onClick={
                  readOnly ? undefined : () => setSelectedReading(reading)
                }
                readOnly={readOnly}
              />
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-gray-200 bg-white rounded-lg shadow">
          {filteredReadings.map((reading) => {
            const book = booksById.get(reading.bookId) ?? UNKNOWN_BOOK;
            return (
              <BookRow
                key={reading.id}
                bookTitle={book.title}
                bookAuthor={book.author}
                tiles={reading.tiles}
                isFreebie={reading.isFreebie}
                onClick={
                  readOnly ? undefined : () => setSelectedReading(reading)
                }
                readOnly={readOnly}
              />
            );
          })}
        </div>
      )}

      {!readOnly && (
        <>
          <Dialog
            isOpen={!!selectedReading && !showDeleteConfirm}
            onClose={() => setSelectedReading(null)}
            title="Edit Book"
          >
            <BookForm
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
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-red-600 hover:text-red-800"
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
