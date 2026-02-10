import { useState, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { useToast } from '../lib/ToastContext';
import { deleteReading, updateReading } from '../lib/books';
import { Reading } from '../types';
import { BookCard } from './BookCard';
import { BookForm, BookFormData } from './BookForm';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { SearchFilter } from './SearchFilter';

interface BookListProps {
  user: User;
}

export function BookList({ user }: BookListProps) {
  const [authorFilter, setAuthorFilter] = useState('');
  const [selectedReading, setSelectedReading] = useState<Reading | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showSuccess, showError } = useToast();

  const [snapshot, loading, error] = useCollection(
    collection(db, 'users', user.uid, 'readings')
  );

  const readings: Reading[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Reading[];
  }, [snapshot]);

  const filteredReadings = useMemo(() => {
    if (!authorFilter.trim()) return readings;
    const filter = authorFilter.toLowerCase();
    return readings.filter((r) =>
      r.bookAuthor.toLowerCase().includes(filter)
    );
  }, [readings, authorFilter]);

  const handleEdit = async (data: BookFormData) => {
    if (!selectedReading) return;
    setIsSubmitting(true);
    try {
      await updateReading(user.uid, selectedReading.id, data.title, data.author, data.tiles, data.isFreebie);
      showSuccess('Book updated successfully');
      setSelectedReading(null);
    } catch (err) {
      showError('Failed to update book');
      console.error('Update book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReading) return;
    setIsSubmitting(true);
    try {
      await deleteReading(user.uid, selectedReading.id);
      showSuccess('Book deleted successfully');
      setShowDeleteConfirm(false);
      setSelectedReading(null);
    } catch (err) {
      showError('Failed to delete book');
      console.error('Delete book error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading books...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      {readings.length > 0 && (
        <SearchFilter value={authorFilter} onChange={setAuthorFilter} />
      )}

      {filteredReadings.length === 0 ? (
        readings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="text-center py-8 text-gray-500">
            No books match your filter.
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredReadings.map((reading) => (
            <BookCard
              key={reading.id}
              reading={reading}
              onClick={() => setSelectedReading(reading)}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={selectedReading !== null}
        onClose={() => setSelectedReading(null)}
        title="Edit Book"
      >
        {selectedReading && (
          <>
            <BookForm
              initialData={{
                title: selectedReading.bookTitle,
                author: selectedReading.bookAuthor,
                tiles: selectedReading.tiles ?? [],
                isFreebie: selectedReading.isFreebie ?? false,
              }}
              onSubmit={handleEdit}
              onCancel={() => setSelectedReading(null)}
              isSubmitting={isSubmitting}
            />
            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-600 hover:text-red-800 text-sm"
                disabled={isSubmitting}
              >
                Delete this book
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Book"
        message={`Are you sure you want to delete "${selectedReading?.bookTitle}"? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}