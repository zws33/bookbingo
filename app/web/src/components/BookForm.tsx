import { useState, type SubmitEvent } from 'react';
import type { BookMetadata } from '@bookbingo/lib-types';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';
import { Input, Label, Button } from './ui/index';

export interface BookFormData {
  title: string;
  author: string;
  tiles: string[];
  isFreebie: boolean;
  /** Only present when the form was rendered with `collectMetadata`. */
  metadata?: BookMetadata;
}

interface BookFormProps {
  identityLocked: boolean;
  initialData?: BookFormData | undefined;
  onSubmit: (data: BookFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /**
   * Also collect catalog metadata (page count, ISBN, etc.) alongside the
   * identity fields. Meaningful only when identity is editable — this is the
   * manual-entry failsafe for a book search didn't find, so nothing upstream
   * has metadata for it yet.
   */
  collectMetadata?: boolean;
}

export function BookForm({
  identityLocked,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  collectMetadata = false,
}: BookFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [author, setAuthor] = useState(initialData?.author ?? '');
  const [tiles, setTiles] = useState<string[]>(initialData?.tiles ?? []);
  const [isFreebie, setIsFreebie] = useState(initialData?.isFreebie ?? false);

  const [pageCount, setPageCount] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [isbn, setIsbn] = useState('');
  const [language, setLanguage] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [categories, setCategories] = useState('');

  const isValid = title.trim() !== '' && author.trim() !== '';
  const showMetadataFields = collectMetadata && !identityLocked;

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    const metadata: BookMetadata | undefined = showMetadataFields
      ? {
          pageCount: pageCount.trim() === '' ? null : Number(pageCount),
          publishedDate:
            publishedDate.trim() === '' ? null : publishedDate.trim(),
          categories: categories
            .split(',')
            .map((category) => category.trim())
            .filter((category) => category !== ''),
          language: language.trim() === '' ? null : language.trim(),
          isbn: isbn.trim() === '' ? null : isbn.trim(),
          thumbnailUrl: thumbnailUrl.trim() === '' ? null : thumbnailUrl.trim(),
        }
      : undefined;

    onSubmit({
      title: title.trim(),
      author: author.trim(),
      tiles,
      isFreebie,
      ...(metadata && { metadata }),
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

      {showMetadataFields && (
        <div className="space-y-3 rounded-lg border border-outline-variant p-3">
          <p className="text-sm font-medium text-on-surface">
            Additional details (optional)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pageCount" className="mb-1">
                Page count
              </Label>
              <Input
                id="pageCount"
                type="number"
                min="0"
                step="1"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="e.g. 412"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="publishedDate" className="mb-1">
                Published
              </Label>
              <Input
                id="publishedDate"
                type="text"
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
                placeholder="e.g. 1965"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="isbn" className="mb-1">
                ISBN
              </Label>
              <Input
                id="isbn"
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="e.g. 9780441172719"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="language" className="mb-1">
                Language
              </Label>
              <Input
                id="language"
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g. en"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="categories" className="mb-1">
              Categories
            </Label>
            <Input
              id="categories"
              type="text"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="Comma-separated, e.g. Science Fiction, Classics"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <Label htmlFor="thumbnailUrl" className="mb-1">
              Cover image URL
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
        </div>
      )}

      <FreebieToggle isFreebie={isFreebie} onChange={setIsFreebie} />

      <TileSelector
        selectedTiles={tiles}
        onChange={setTiles}
        isFreebie={isFreebie}
      />

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
