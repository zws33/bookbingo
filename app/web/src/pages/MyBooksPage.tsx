import { useState, useCallback } from 'react';
import type { Book } from '@bookbingo/lib-types';
import { useReadings } from '../hooks/useReadings';
import { useInvalidateReadings } from '../hooks/useInvalidateReadings';
import { useToast } from '../lib/ToastContext';
import { createReading } from '../data/readings';
import { BookList } from '../components/BookList';
import { BookSearch } from '../components/BookSearch';
import { ScoreDisplay } from '../components/ScoreDisplay';
import { Dialog } from '../components/ui/index.js';
import { BookForm, type BookFormData } from '../components/BookForm';
import { log } from '@bookbingo/lib-util';
import { createManualBook } from '../lib/createManualBook';
import { ReadingForm } from 'src/components/ReadingForm.js';

interface MyBooksPageProps {
  userId: string;
}

type DialogState =
  | { kind: 'search' }
  | { kind: 'readingForm'; book: Book }
  | { kind: 'manualEntry' }
  | null;

export function MyBooksPage({ userId }: MyBooksPageProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();
  const {
    readings,
    score,
    loading: readingsLoading,
    error: readingsError,
  } = useReadings(userId);
  const invalidate = useInvalidateReadings(userId);

  const loading = readingsLoading;
  const error = readingsError;
  const scoreBreakdown = readings.length > 0 ? score : null;

  // The search callable returns the whole book, so the form renders at once.
  const handleBookSelected = useCallback((book: Book) => {
    setDialog({ kind: 'readingForm', book });
  }, []);

  const handleAddModalClose = useCallback(() => {
    setDialog(null);
  }, []);

  // Reached only when catalog search finds nothing, so there is no enrichment
  // to attach. createManualBook is the only writer of /books on this path.
  const handleAddBook = async (data: BookFormData) => {
    setIsSubmitting(true);
    try {
      const book = await createManualBook(
        data.title,
        data.author,
        data.metadata,
      );
      await createReading({
        bookId: book.id,
        tiles: data.tiles,
        isFreebie: data.isFreebie,
      });
      await invalidate();
      showSuccess('Book added successfully');
      handleAddModalClose();
    } catch (err) {
      showError('Failed to add book');
      log.error('Add book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // fetchBookDetails already wrote the book and derived its id; this only
  // records the reading.
  const submitReadingData = async (data: {
    tiles: string[];
    isFreebie: boolean;
  }) => {
    if (dialog?.kind !== 'readingForm') return;
    setIsSubmitting(true);
    try {
      await createReading({
        bookId: dialog.book.id,
        tiles: data.tiles,
        isFreebie: data.isFreebie,
      });
      await invalidate();
      showSuccess('Book added successfully');
      handleAddModalClose();
    } catch (err) {
      showError('Failed to add book');
      log.error('Add book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {' '}
      <div className="space-y-6">
        {' '}
        {scoreBreakdown && <ScoreDisplay breakdown={scoreBreakdown} />}{' '}
        <BookList
          userId={userId}
          readings={readings}
          loading={loading}
          error={error}
        />
        <div className="fixed right-4 bottom-20 sm:right-8">
          <button
            onClick={() => setDialog({ kind: 'search' })}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-colors hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
            aria-label="Add book"
          >
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>
      <Dialog
        isOpen={dialog !== null}
        onClose={handleAddModalClose}
        title="Add New Book"
      >
        {dialog?.kind === 'search' && (
          <BookSearch
            onBookSelected={handleBookSelected}
            onManualEntry={() => setDialog({ kind: 'manualEntry' })}
          />
        )}
        {dialog?.kind === 'readingForm' && (
          <ReadingForm
            initialData={{
              title: dialog.book.title,
              author: dialog.book.author,
              tiles: [],
              isFreebie: false,
            }}
            onSubmit={submitReadingData}
            onCancel={handleAddModalClose}
            isSubmitting={isSubmitting}
          />
        )}
        {dialog?.kind === 'manualEntry' && (
          <BookForm
            identityLocked={false}
            collectMetadata
            onSubmit={handleAddBook}
            onCancel={handleAddModalClose}
            isSubmitting={isSubmitting}
          />
        )}
      </Dialog>
    </>
  );
}
