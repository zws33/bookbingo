import { useState, SubmitEvent } from 'react';
import { TileSelector } from './TileSelector';
import { Label, Button, Textarea, Input } from './ui/index.js';

export interface TBRFormData {
  plannedTiles: string[];
  notes: string;
  /** Present only in editable (manual-entry) mode. */
  title?: string;
  author?: string;
}

interface TBRFormProps {
  editable?: boolean;
  bookTitle: string;
  bookAuthor: string;
  initialData?: TBRFormData;
  onSubmit: (data: TBRFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function TBRForm({
  editable,
  bookTitle,
  bookAuthor,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: TBRFormProps) {
  const [plannedTiles, setPlannedTiles] = useState<string[]>(
    initialData?.plannedTiles ?? [],
  );
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [title, setTitle] = useState(bookTitle);
  const [author, setAuthor] = useState(bookAuthor);

  const isValid = editable ? title.trim() !== '' && author.trim() !== '' : true;

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (isSubmitting || !isValid) return;
    onSubmit({
      plannedTiles,
      notes,
      ...(editable ? { title: title.trim(), author: author.trim() } : {}),
    });
  };

  const isEdit = Boolean(initialData);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!editable && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-sm font-medium text-gray-900">{bookTitle}</p>
          <p className="text-sm text-gray-500">{bookAuthor}</p>
        </div>
      )}
      {editable && (
        <div>
          <div>
            <Label htmlFor="title" className="mb-1">
              Title
            </Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter book title"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <Label htmlFor="author" className="mb-1">
              Author
            </Label>
            <Input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Enter author name"
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      <TileSelector
        selectedTiles={plannedTiles}
        onChange={setPlannedTiles}
        isFreebie={false}
      />

      <div>
        <Label htmlFor="tbr-notes" className="mb-1">
          Notes (optional)
        </Label>
        <Textarea
          id="tbr-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about why you want to read this..."
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isValid}>
          {isSubmitting
            ? 'Saving...'
            : isEdit
              ? 'Save Changes'
              : 'Add to Reading List'}
        </Button>
      </div>
    </form>
  );
}
