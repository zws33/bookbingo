import { useState, useCallback } from 'react';
import type { Book, TBREntry } from '@bookbingo/lib-types';
import { useTBR } from '../hooks/useTBR';
import { useBooks } from '../hooks/useBooks';
import { useToast } from '../lib/ToastContext';
import { getOrCreateBook } from '../lib/books';
import { createTBREntry, updateTBREntry, deleteTBREntry, promoteTBREntry } from '../lib/tbr';
import { TBRForm, type TBRFormData } from '../components/TBRForm';
import { BookForm, type BookFormData } from '../components/BookForm';
import { BookSearchModal } from '../components/BookSearchModal';
import { PageStatus } from '../components/PageStatus';
import { Dialog, AlertDialog, TileBadge, Button } from '../components/ui/index.js';
import { log } from '@bookbingo/lib-util';
import type { BookEnrichmentResult } from '@bookbingo/lib-types';

interface ReadingListPageProps {
  userId: string;
}

type DialogState =
  | { kind: 'add'; enrichment: BookEnrichmentResult }
  | { kind: 'edit'; entry: TBREntry; book: Book }
  | { kind: 'promote'; entry: TBREntry; book: Book }
  | { kind: 'delete'; entry: TBREntry }
  | null;

export function ReadingListPage({ userId }: ReadingListPageProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { entries, loading, error } = useTBR(userId);
  const { booksById } = useBooks();
  const { showSuccess, showError } = useToast();

  const closeDialog = useCallback(() => setDialog(null), []);

  const handleBookSelectedForAdd = useCallback((enrichment: BookEnrichmentResult | null) => {
    setIsSearchOpen(false);
    if (enrichment) {
      setTimeout(() => setDialog({ kind: 'add', enrichment }), 200);
    }
  }, []);

  const handleAdd = async (data: TBRFormData) => {
    if (dialog?.kind !== 'add') return;
    setIsSubmitting(true);
    try {
      const bookId = await getOrCreateBook(
        dialog.enrichment.title,
        dialog.enrichment.author,
        userId,
        { externalId: dialog.enrichment.externalId, metadata: dialog.enrichment.metadata },
      );
      await createTBREntry(userId, bookId, data.plannedTiles, data.notes);
      showSuccess('Added to reading list');
      closeDialog();
    } catch (err) {
      showError('Failed to add book');
      log.error('TBR add error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: TBRFormData) => {
    if (dialog?.kind !== 'edit') return;
    setIsSubmitting(true);
    try {
      await updateTBREntry(userId, dialog.entry.id, data.plannedTiles, data.notes);
      showSuccess('Reading list updated');
      closeDialog();
    } catch (err) {
      showError('Failed to update entry');
      log.error('TBR edit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (dialog?.kind !== 'delete') return;
    setIsSubmitting(true);
    try {
      await deleteTBREntry(userId, dialog.entry.id);
      showSuccess('Removed from reading list');
      closeDialog();
    } catch (err) {
      showError('Failed to remove book');
      log.error('TBR delete error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromote = async (data: BookFormData) => {
    if (dialog?.kind !== 'promote') return;
    setIsSubmitting(true);
    try {
      await promoteTBREntry(
        userId,
        dialog.entry.id,
        dialog.entry.bookId,
        data.tiles,
        data.isFreebie,
      );
      showSuccess('Book logged — removed from reading list');
      closeDialog();
    } catch (err) {
      showError('Failed to log book');
      log.error('TBR promote error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  return (
    <>
      <div className="space-y-4">
        {entries.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📖</div>
            <h3 className="text-lg font-medium text-gray-900">Your reading list is empty</h3>
            <p className="text-gray-500 mt-1">
              Add books you plan to read using the button below.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const book = booksById.get(entry.bookId);
            return (
              <TBREntryCard
                key={entry.id}
                entry={entry}
                book={book}
                onEdit={() => book && setDialog({ kind: 'edit', entry, book })}
                onDelete={() => setDialog({ kind: 'delete', entry })}
                onPromote={() => book && setDialog({ kind: 'promote', entry, book })}
              />
            );
          })
        )}

        <div className="fixed bottom-20 right-4 sm:right-8">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label="Add to reading list"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        onBookSelected={handleBookSelectedForAdd}
      />

      {/* Add dialog */}
      <Dialog
        isOpen={dialog?.kind === 'add'}
        onClose={closeDialog}
        title="Add to Reading List"
      >
        {dialog?.kind === 'add' && (
          <TBRForm
            bookTitle={dialog.enrichment.title}
            bookAuthor={dialog.enrichment.author}
            onSubmit={handleAdd}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        isOpen={dialog?.kind === 'edit'}
        onClose={closeDialog}
        title="Edit Reading List Entry"
      >
        {dialog?.kind === 'edit' && (
          <TBRForm
            bookTitle={dialog.book.title}
            bookAuthor={dialog.book.author}
            initialData={{ plannedTiles: dialog.entry.plannedTiles, notes: dialog.entry.notes ?? '' }}
            onSubmit={handleEdit}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
      </Dialog>

      {/* Mark as Read dialog */}
      <Dialog
        isOpen={dialog?.kind === 'promote'}
        onClose={closeDialog}
        title="Mark as Read"
      >
        {dialog?.kind === 'promote' && (
          <BookForm
            initialData={{
              title: dialog.book.title,
              author: dialog.book.author,
              tiles: dialog.entry.plannedTiles,
              isFreebie: false,
            }}
            onSubmit={handlePromote}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        isOpen={dialog?.kind === 'delete'}
        onClose={closeDialog}
        onConfirm={handleDelete}
        title="Remove from reading list?"
        message="This will permanently remove the book from your reading list."
        confirmLabel="Remove"
      />
    </>
  );
}

interface TBREntryCardProps {
  entry: TBREntry;
  book: Book | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onPromote: () => void;
}

function TBREntryCard({ entry, book, onEdit, onDelete, onPromote }: TBREntryCardProps) {
  const thumbnailUrl = book?.metadata?.thumbnailUrl;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex gap-3">
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-12 h-16 object-cover rounded flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">
            {book?.title ?? 'Unknown title'}
          </p>
          <p className="text-sm text-gray-500 truncate">{book?.author ?? '—'}</p>

          {entry.plannedTiles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.plannedTiles.map((tileId) => (
                <TileBadge key={tileId} tileId={tileId} variant="secondary" />
              ))}
            </div>
          )}

          {entry.notes && (
            <p className="text-sm text-gray-500 mt-2 italic">{entry.notes}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
        <Button variant="ghost" className="text-sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" className="text-sm text-red-600 hover:text-red-700" onClick={onDelete}>
          Remove
        </Button>
        <Button variant="outline" className="text-sm" onClick={onPromote}>
          Mark as Read
        </Button>
      </div>
    </div>
  );
}
