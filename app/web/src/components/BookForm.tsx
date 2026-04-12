import { useState, SubmitEvent } from 'react';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';

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
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter book title"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="author" className="block text-sm font-medium text-gray-700 mb-1">
          Author
        </label>
        <input
          id="author"
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter author name"
          disabled={isSubmitting}
        />
      </div>

      <FreebieToggle isFreebie={isFreebie} onChange={setIsFreebie} />

      <TileSelector selectedTiles={tiles} onChange={setTiles} isFreebie={isFreebie} />

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
