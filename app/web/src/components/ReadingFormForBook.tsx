import type { Book } from '@bookbingo/lib-types';
import { ReadingForm } from './ReadingForm';
import { Button, Spinner } from './ui/index.js';

interface ReadingFormForBookProps {
  /**
   * Undefined until the `/books` snapshot carrying this book arrives. The
   * server writes the book before the callable returns, so the listener is
   * only ever a beat behind — but it is a beat, and the form needs a title.
   */
  book: Book | undefined;
  /**
   * The `/books` listener's error. Without it a failed subscription leaves
   * `book` undefined forever and the spinner never resolves; the page's own
   * error surface is behind this dialog, so it has to be repeated here.
   */
  error?: Error | undefined;
  onSubmit: (data: {
    tiles: string[];
    isFreebie: boolean;
  }) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ReadingFormForBook({
  book,
  error,
  onSubmit,
  onCancel,
  isSubmitting,
}: ReadingFormForBookProps) {
  if (!book) {
    // The listener is the only source of this book, and a snapshot error ends
    // the subscription — there is nothing to retry from inside the dialog, so
    // the exit is to close and reopen the page.
    if (error) {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-error">
            Could not load this book: {error.message}
          </p>
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">Loading book...</span>
      </div>
    );
  }

  return (
    <ReadingForm
      initialData={{
        title: book.title,
        author: book.author,
        tiles: [],
        isFreebie: false,
      }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}
