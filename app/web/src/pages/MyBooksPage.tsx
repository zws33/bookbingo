import { useState, useMemo, useCallback } from 'react';
import { useReadings } from '../hooks/useReadings';
import { useBooks } from '../hooks/useBooks';
import { useToast } from '../lib/ToastContext';
import { getOrCreateBook, createReading } from '../lib/books';
import { BookList } from '../components/BookList';
import { BookSearchModal } from '../components/BookSearchModal';
import { ScoreDisplay } from '../components/ScoreDisplay';
import { Dialog } from '../components/ui/index.js';
import { BookForm, type BookFormData } from '../components/BookForm';
import { getScoreBreakdown } from '@bookbingo/lib-core';
import { log } from '@bookbingo/lib-util';
import type { BookEnrichmentResult } from '../lib/bookSearch';

interface MyBooksPageProps {
  userId: string;
}

export function MyBooksPage({ userId }: MyBooksPageProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pendingEnrichment, setPendingEnrichment] =
    useState<BookEnrichmentResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();
  const {
    readings,
    loading: readingsLoading,
    error: readingsError,
  } = useReadings(userId);
  const { booksById, loading: booksLoading, error: booksError } = useBooks();

  const loading = readingsLoading || booksLoading;
  const error = readingsError || booksError;

  const scoreBreakdown = useMemo(() => {
    if (!readings || readings.length === 0) return null;
    return getScoreBreakdown(readings);
  }, [readings]);

  const handleBookSelected = useCallback(
    (data: BookEnrichmentResult | null) => {
      setPendingEnrichment(data);
      setIsSearchOpen(false);
      setTimeout(() => setIsAddModalOpen(true), 200);
    },
    [],
  );

  const handleAddModalClose = useCallback(() => {
    setIsAddModalOpen(false);
    setPendingEnrichment(null);
  }, []);

  const handleAddBook = async (data: BookFormData) => {
    setIsSubmitting(true);
    try {
      const enrichment = pendingEnrichment
        ? {
            externalId: pendingEnrichment.externalId,
            metadata: pendingEnrichment.metadata,
          }
        : undefined;
      const bookId = await getOrCreateBook(
        data.title,
        data.author,
        userId,
        enrichment,
      );
      await createReading(userId, bookId, data.tiles, data.isFreebie);
      showSuccess('Book added successfully');
      handleAddModalClose();
    } catch (err) {
      showError('Failed to add book');
      log.error('Add book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addFormInitialData = pendingEnrichment
    ? {
        title: pendingEnrichment.title,
        author: pendingEnrichment.author,
        tiles: [],
        isFreebie: false,
      }
    : undefined;

  return (
    <>
      <div className="space-y-6">
        {scoreBreakdown && <ScoreDisplay breakdown={scoreBreakdown} />}
        <BookList
          userId={userId}
          readings={readings}
          booksById={booksById}
          loading={loading}
          error={error}
        />

        <div className="fixed bottom-20 right-4 sm:right-8">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Add book"
          >
            <svg
              className="w-8 h-8"
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

      <BookSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onBookSelected={handleBookSelected}
        onManualEntry={() => handleBookSelected(null)}
      />

      <Dialog
        isOpen={isAddModalOpen}
        onClose={handleAddModalClose}
        title="Add New Book"
      >
        <BookForm
          initialData={addFormInitialData}
          onSubmit={handleAddBook}
          onCancel={handleAddModalClose}
          isSubmitting={isSubmitting}
        />
      </Dialog>
    </>
  );
}
