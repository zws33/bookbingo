import type { Book } from '../types/schemas';
import { ReadingForm } from './ReadingForm';

interface ReadingFormForBookProps {
  /**
   * Always present: the callable that resolved this book returned it whole, so
   * there is nothing to wait for and no failure state to render here.
   */
  book: Book;
  onSubmit: (data: {
    tiles: string[];
    isFreebie: boolean;
  }) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ReadingFormForBook({
  book,
  onSubmit,
  onCancel,
  isSubmitting,
}: ReadingFormForBookProps) {
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
