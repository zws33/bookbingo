import { useState, useCallback } from 'react';
import type { Book, TBREntry } from '@bookbingo/lib-types';
import { useTBR } from '../hooks/useTBR';
import { useBooks } from '../hooks/useBooks';
import { useToast } from '../lib/ToastContext';
import { getOrCreateBook } from '../data/books';
import {
  createTBREntry,
  updateTBREntry,
  deleteTBREntry,
  promoteTBREntry,
} from '../lib/tbr';
import { BookForm, type BookFormData } from '../components/BookForm.js';
import { BookSearch } from '../components/BookSearch';
import { BookCard } from '../components/BookCard';
import { PageStatus } from '../components/PageStatus';
import { Dialog, AlertDialog, Button } from '../components/ui/index.js';
import { log } from '@bookbingo/lib-util';
import type { BookEnrichmentResult } from '@bookbingo/lib-types';

interface ReadingListPageProps {
  userId: string;
}

type DialogState =
  | { kind: 'search' }
  | { kind: 'add'; enrichment: BookEnrichmentResult }
  | { kind: 'manual' }
  | { kind: 'edit'; entry: TBREntry; book: Book }
  | { kind: 'promote'; entry: TBREntry; book: Book }
  | { kind: 'delete'; entry: TBREntry }
  | null;

export function ReadingListPage({ userId }: ReadingListPageProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { entries, loading, error } = useTBR(userId);
  const { booksById } = useBooks();
  const { showSuccess, showError } = useToast();

  const closeDialog = useCallback(() => setDialog(null), []);

  const handleBookSelectedForAdd = useCallback(
    (enrichment: BookEnrichmentResult) => {
      setDialog({ kind: 'add', enrichment });
    },
    [],
  );

  const handleOpenManual = useCallback(() => {
    setDialog({ kind: 'manual' });
  }, []);

  const handleAdd = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'add') return;
      setIsSubmitting(true);
      try {
        const bookId = await getOrCreateBook(
          dialog.enrichment.title,
          dialog.enrichment.author,
          userId,
          {
            externalId: dialog.enrichment.externalId,
            metadata: dialog.enrichment.metadata,
          },
        );
        await createTBREntry(userId, bookId, data.tiles);
        showSuccess('Added to reading list');
        closeDialog();
      } catch (err) {
        showError('Failed to add book');
        log.error('TBR add error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, userId, showSuccess, showError, closeDialog],
  );

  const handleManualAdd = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'manual') return;
      if (!data.title || !data.author) return;
      setIsSubmitting(true);
      try {
        const bookId = await getOrCreateBook(data.title, data.author, userId);
        await createTBREntry(userId, bookId, data.tiles);
        showSuccess('Added to reading list');
        closeDialog();
      } catch (err) {
        showError('Failed to add book');
        log.error('TBR manual add error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, userId, showSuccess, showError, closeDialog],
  );

  const handleEdit = useCallback(
    async (data: BookFormData) => {
      if (dialog?.kind !== 'edit') return;
      setIsSubmitting(true);
      try {
        await updateTBREntry(userId, dialog.entry.id, data.tiles);
        showSuccess('Reading list updated');
        closeDialog();
      } catch (err) {
        showError('Failed to update entry');
        log.error('TBR edit error:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [dialog, userId, showSuccess, showError, closeDialog],
  );

  const handleDelete = useCallback(async () => {
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
  }, [dialog, userId, showSuccess, showError, closeDialog]);

  const handlePromote = useCallback(
    async (data: BookFormData) => {
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
    },
    [dialog, userId, showSuccess, showError, closeDialog],
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
          entries.map((entry) => {
            const book = booksById.get(entry.bookId);
            return (
              <TBREntryCard
                key={entry.id}
                entry={entry}
                book={book}
                onEdit={() => book && setDialog({ kind: 'edit', entry, book })}
                onDelete={() => setDialog({ kind: 'delete', entry })}
                onPromote={() =>
                  book && setDialog({ kind: 'promote', entry, book })
                }
              />
            );
          })
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
          <BookForm
            identityLocked={true}
            initialData={{
              title: dialog.enrichment.title,
              author: dialog.enrichment.author,
              tiles: [],
              isFreebie: false,
            }}
            onSubmit={handleAdd}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
        {dialog?.kind === 'manual' && (
          <BookForm
            identityLocked={false}
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
              title: dialog.book.title,
              author: dialog.book.author,
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

function TBREntryCard({
  entry,
  book,
  onEdit,
  onDelete,
  onPromote,
}: TBREntryCardProps) {
  return (
    <BookCard
      bookTitle={book?.title ?? 'Unknown title'}
      bookAuthor={book?.author ?? '—'}
      tiles={entry.plannedTiles}
      metadata={book?.metadata}
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
