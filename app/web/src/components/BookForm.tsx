import { useState, SubmitEvent } from 'react';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';
import { Input, Label, Button } from './ui/index.js';

export interface BookFormData {
  title: string;
  author: string;
  tiles: string[];
  isFreebie: boolean;
}

interface BookFormProps {
  initialData?: BookFormData;
  onSubmit: (data: BookFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function BookForm({ initialData, onSubmit, onCancel, isSubmitting }: BookFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [author, setAuthor] = useState(initialData?.author ?? '');
  const [tiles, setTiles] = useState<string[]>(initialData?.tiles ?? []);
  const [isFreebie, setIsFreebie] = useState(initialData?.isFreebie ?? false);

  const isValid = title.trim() !== '' && author.trim() !== '';

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({ title: title.trim(), author: author.trim(), tiles, isFreebie });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <FreebieToggle isFreebie={isFreebie} onChange={setIsFreebie} />

      <TileSelector selectedTiles={tiles} onChange={setTiles} isFreebie={isFreebie} />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
