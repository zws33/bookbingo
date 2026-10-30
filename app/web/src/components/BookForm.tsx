import { useState, type SubmitEvent } from 'react';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';
import { Input, Label, Button } from './ui/index';

export interface BookFormData {
  title: string;
  author: string;
  tiles: string[];
  isFreebie: boolean;
  /** Only present when the form was rendered with `collectCover`. */
  thumbnailUrl?: string | null;
}

interface BookFormProps {
  identityLocked: boolean;
  initialData?: BookFormData | undefined;
  onSubmit: (data: BookFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /**
   * Also collect a cover URL alongside the identity fields. Meaningful only
   * when identity is editable — this is the manual-entry failsafe for a book
   * search didn't find, so nothing upstream has a cover for it yet.
   */
  collectCover?: boolean;
}

export function BookForm({
  identityLocked,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  collectCover = false,
}: BookFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [author, setAuthor] = useState(initialData?.author ?? '');
  const [tiles, setTiles] = useState<string[]>(initialData?.tiles ?? []);
  const [isFreebie, setIsFreebie] = useState(initialData?.isFreebie ?? false);

  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const freebieWithNoTiles = isFreebie && tiles.length === 0;
  const isValid =
    title.trim() !== '' && author.trim() !== '' && !freebieWithNoTiles;
  const showCoverField = collectCover && !identityLocked;

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    onSubmit({
      title: title.trim(),
      author: author.trim(),
      tiles,
      isFreebie,
      ...(showCoverField && {
        thumbnailUrl: thumbnailUrl.trim() === '' ? null : thumbnailUrl.trim(),
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {identityLocked && (
        <div className="rounded-lg bg-surface-container px-3 py-2">
          <p className="text-sm font-medium text-on-surface">{title}</p>
          <p className="text-sm text-on-surface-variant">{author}</p>
        </div>
      )}
      {!identityLocked && (
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

      {showCoverField && (
        <div>
          <Label htmlFor="thumbnailUrl" className="mb-1">
            Cover image URL (optional)
          </Label>
          <Input
            id="thumbnailUrl"
            type="text"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://..."
            disabled={isSubmitting}
          />
        </div>
      )}

      <FreebieToggle isFreebie={isFreebie} onChange={setIsFreebie} />

      <TileSelector
        selectedTiles={tiles}
        onChange={setTiles}
        isFreebie={isFreebie}
      />

      {freebieWithNoTiles && (
        <p className="mt-1 text-xs text-error">
          A freebie needs at least one tile.
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
