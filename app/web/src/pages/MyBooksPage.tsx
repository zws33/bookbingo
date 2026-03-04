import { useState, useMemo } from 'react';
import { getScoreBreakdown } from '@bookbingo/lib-core';
import { useToast } from '../lib/ToastContext';
import { useReadings } from '../hooks/useReadings';
import { createReading } from '../lib/books';
import { mapReadingsToUserBooks } from '../lib/mappings';
import { BookList } from '../components/BookList';
import { Modal } from '../components/Modal';
import { BookForm, BookFormData } from '../components/BookForm';
import { ScoreDisplay } from '../components/ScoreDisplay';

interface MyBooksPageProps {
  userId: string;
}

export function MyBooksPage({ userId }: MyBooksPageProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();
  const { readings, loading, error } = useReadings(userId);

  const scoreBreakdown = useMemo(() => {
    if (!readings || readings.length === 0) return null;
    const userBooks = mapReadingsToUserBooks(readings, userId);
    return getScoreBreakdown(userBooks);
  }, [readings, userId]);

  const handleAddBook = async (data: BookFormData) => {
    setIsSubmitting(true);
    try {
      await createReading(userId, data.title, data.author, data.tiles, data.isFreebie);
      showSuccess('Book added successfully');
      setIsAddModalOpen(false);
    } catch (err) {
      showError('Failed to add book');
      console.error('Add book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {scoreBreakdown && <ScoreDisplay breakdown={scoreBreakdown} />}
        <BookList
          userId={userId}
          readings={readings}
          loading={loading}
          error={error}
        />
      </div>
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Add book"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          if (isSubmitting) return;
          setIsAddModalOpen(false);
        }}
        title="Add Book"
      >
        <BookForm
          onSubmit={handleAddBook}
          onCancel={() => setIsAddModalOpen(false)}
          isSubmitting={isSubmitting}
        />
      </Modal>
    </>
  );
}
