import { useState, useCallback } from 'react';
import type { Book, TBREntry } from '../types/schemas';
import { useTBR } from '../hooks/useTBR';
import { useInvalidateReadings } from '../hooks/useInvalidateReadings';
import { useToast } from '../lib/ToastContext';
import { createManualBook } from '../lib/createManualBook';
import {
  createTBREntry,
  updateTBREntry,
  deleteTBREntry,
  promoteTBREntry,
} from '../data/tbr';
import { BookForm, type BookFormData } from '../components/BookForm.js';
import { ReadingFormForBook } from '../components/ReadingFormForBook';
import { BookSearch } from '../components/BookSearch';
import { BookCard } from '../components/BookCard';
import { PageStatus } from '../components/PageStatus';
import { Dialog, AlertDialog, Button } from '../components/ui/index.js';
import { log } from '@bookbingo/lib-util';

interface ReadingListPageProps {
  userId: string;
}

type DialogState =
  | { kind: 'search' }
  | { kind: 'add'; book: Book }
  | { kind: 'manual' }
  | { kind: 'edit'; entry: TBREntry }
  | { kind: 'promote'; entry: TBREntry }
  | { kind: 'delete'; entry: TBREntry }
  | null;

export function ReadingListPage({ userId }: ReadingListPageProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { entries, loading, error } = useTBR(userId);
  const { showSuccess, showError } = useToast();
  const invalidate = useInvalidateReadings(userId);

  const closeDialog = useCallback(() => setDialog(null), []);

  // The search callable returns the whole book, so the form renders at once.
  const handleBookSelectedForAdd = useCallback((book: Book) => {
    setDialog({ kind: 'add', book });
  }, []);

  const handleOpenManual = useCallback(() => {
    setDialog({ kind: 'manual' });
  }, []);

  const handleAdd = useCallback(
    async (data: { tiles: string[]; isFreebie: boolean }) => {
      if (dialog?.kind !== 'add') return;
      setIsSubmitting(true);
      try {
        await createTBREntry({
          bookId: dialog.book.id,
          plannedTiles: data.tiles,
        });
        await invalidate();
        showSuccess('Added to reading list');
        closeDialog();
      } catch (err) {
        showError('Failed to add book');
        log.error('TBR add error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, invalidate, showSuccess, showError, closeDialog],
  );

  // Failsafe path: only reached when catalog search doesn't find the book, so
  // createManualBook (server-side) is the only thing that ever writes it to
  // /books.
  const handleManualAdd = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'manual') return;
      setIsSubmitting(true);
      try {
        const book = await createManualBook(
          data.title,
          data.author,
          data.metadata,
        );
        await createTBREntry({ bookId: book.id, plannedTiles: data.tiles });
        await invalidate();
        showSuccess('Added to reading list');
        closeDialog();
      } catch (err) {
        showError('Failed to add book');
        log.error('TBR manual add error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, invalidate, showSuccess, showError, closeDialog],
  );

  const handleEdit = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'edit') return;
      setIsSubmitting(true);
      try {
        await updateTBREntry({
          tbrId: dialog.entry.id,
          plannedTiles: data.tiles,
        });
        await invalidate();
        showSuccess('Reading list updated');
        closeDialog();
      } catch (err) {
        showError('Failed to update entry');
        log.error('TBR edit error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, invalidate, showSuccess, showError, closeDialog],
  );

  const handleDelete = useCallback(async () => {
    if (dialog?.kind !== 'delete') return;
    setIsSubmitting(true);
    try {
      await deleteTBREntry({ tbrId: dialog.entry.id });
      await invalidate();
      showSuccess('Removed from reading list');
      closeDialog();
    } catch (err) {
      showError('Failed to remove book');
      log.error('TBR delete error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [dialog, invalidate, showSuccess, showError, closeDialog]);

  const handlePromote = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'promote') return;
      setIsSubmitting(true);
      try {
        await promoteTBREntry({
          tbrId: dialog.entry.id,
          tiles: data.tiles,
          isFreebie: data.isFreebie,
        });
        await invalidate();
        showSuccess('Book logged — removed from reading list');
        closeDialog();
      } catch (err) {
        showError('Failed to log book');
        log.error('TBR promote error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, invalidate, showSuccess, showError, closeDialog],
  );

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  return (
    <>
      <div className="space-y-4">
        {entries.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 text-4xl">📖</div>
            <h3 className="font-display text-lg font-medium text-on-surface">
              Your reading list is empty
            </h3>
            <p className="mt-1 text-on-surface-variant">
              Add books you plan to read using the button below.
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <TBREntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => setDialog({ kind: 'edit', entry })}
              onDelete={() => setDialog({ kind: 'delete', entry })}
              onPromote={() => setDialog({ kind: 'promote', entry })}
            />
          ))
        )}

        <div className="fixed right-4 bottom-20 sm:right-8">
          <button
            onClick={() => setDialog({ kind: 'search' })}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-colors hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
            aria-label="Add to reading list"
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

      {/* Add dialog */}
      <Dialog
        isOpen={
          dialog?.kind === 'add' ||
          dialog?.kind === 'search' ||
          dialog?.kind === 'manual'
        }
        onClose={closeDialog}
        title="Add to Reading List"
      >
        {dialog?.kind === 'search' && (
          <BookSearch
            onBookSelected={handleBookSelectedForAdd}
            onManualEntry={handleOpenManual}
          />
        )}
        {dialog?.kind === 'add' && (
          <ReadingFormForBook
            book={dialog.book}
            onSubmit={handleAdd}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
        {dialog?.kind === 'manual' && (
          <BookForm
            identityLocked={false}
            collectMetadata
            onSubmit={handleManualAdd}
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
          <BookForm
            identityLocked={true}
            initialData={{
              title: dialog.entry.bookTitle,
              author: dialog.entry.bookAuthor,
              tiles: dialog.entry.plannedTiles,
              isFreebie: false,
            }}
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
            identityLocked={true}
            initialData={{
              title: dialog.entry.bookTitle,
              author: dialog.entry.bookAuthor,
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
  onEdit: () => void;
  onDelete: () => void;
  onPromote: () => void;
}

function TBREntryCard({
  entry,
  onEdit,
  onDelete,
  onPromote,
}: TBREntryCardProps) {
  return (
    <BookCard
      bookTitle={entry.bookTitle}
      bookAuthor={entry.bookAuthor}
      tiles={entry.plannedTiles}
      thumbnailUrl={entry.bookMetadata.thumbnailUrl}
      notes={entry.notes}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="text-sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="text-sm text-error hover:text-error/90"
            onClick={onDelete}
          >
            Remove
          </Button>
          <Button variant="outline" className="text-sm" onClick={onPromote}>
            Mark as Read
          </Button>
        </div>
      }
    />
  );
}
