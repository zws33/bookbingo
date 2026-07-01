import { useState, useCallback } from 'react';
import type { Book, TBREntry } from '@bookbingo/lib-types';
import { useTBR } from '../hooks/useTBR';
import { useBooks } from '../hooks/useBooks';
import { useToast } from '../lib/ToastContext';
import { getOrCreateBook } from '../lib/books';
import {
  createTBREntry,
  updateTBREntry,
  deleteTBREntry,
  promoteTBREntry,
} from '../lib/tbr';
import { TBRForm, type TBRFormData } from '../components/TBRForm';
import { BookForm, type BookFormData } from '../components/BookForm';
import { BookSearch } from '../components/BookSearch';
import { PageStatus } from '../components/PageStatus';
import {
  Dialog,
  AlertDialog,
  TileBadge,
  Button,
} from '../components/ui/index.js';
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
    async (data: TBRFormData) => {
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
        await createTBREntry(userId, bookId, data.plannedTiles, data.notes);
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
    async (data: TBRFormData) => {
      if (dialog?.kind !== 'manual') return;
      if (!data.title || !data.author) return;
      setIsSubmitting(true);
      try {
        const bookId = await getOrCreateBook(data.title, data.author, userId);
        await createTBREntry(userId, bookId, data.plannedTiles, data.notes);
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
    async (data: TBRFormData) => {
      if (dialog?.kind !== 'edit') return;
      setIsSubmitting(true);
      try {
        await updateTBREntry(
          userId,
          dialog.entry.id,
          data.plannedTiles,
          data.notes,
        );
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
            <h3 className="text-lg font-medium text-gray-900">
              Your reading list is empty
            </h3>
            <p className="mt-1 text-gray-500">
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
            className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
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
          <TBRForm
            bookTitle={dialog.enrichment.title}
            bookAuthor={dialog.enrichment.author}
            onSubmit={handleAdd}
            onCancel={closeDialog}
            isSubmitting={isSubmitting}
          />
        )}
        {dialog?.kind === 'manual' && (
          <TBRForm
            editable={true}
            bookTitle={''}
            bookAuthor={''}
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
          <TBRForm
            bookTitle={dialog.book.title}
            bookAuthor={dialog.book.author}
            initialData={{
              plannedTiles: dialog.entry.plannedTiles,
              notes: dialog.entry.notes ?? '',
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
  const thumbnailUrl = book?.metadata?.thumbnailUrl;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex gap-3">
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-16 w-12 flex-shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">
            {book?.title ?? 'Unknown title'}
          </p>
          <p className="truncate text-sm text-gray-500">
            {book?.author ?? '—'}
          </p>

          {entry.plannedTiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {entry.plannedTiles.map((tileId) => (
                <TileBadge key={tileId} tileId={tileId} variant="secondary" />
              ))}
            </div>
          )}

          {entry.notes && (
            <p className="mt-2 text-sm text-gray-500 italic">{entry.notes}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
        <Button variant="ghost" className="text-sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          className="text-sm text-red-600 hover:text-red-700"
          onClick={onDelete}
        >
          Remove
        </Button>
        <Button variant="outline" className="text-sm" onClick={onPromote}>
          Mark as Read
        </Button>
      </div>
    </div>
  );
}
