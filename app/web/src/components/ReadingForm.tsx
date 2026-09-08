import { useState, type SubmitEvent } from 'react';
import { TileSelector } from './TileSelector';
import { FreebieToggle } from './FreebieToggle';
import { Button } from './ui/index';

export interface ReadingFormData {
  title: string;
  author: string;
  tiles: string[];
  isFreebie: boolean;
}

interface BookFormProps {
  initialData: ReadingFormData;
  onSubmit: (data: {
    tiles: string[];
    isFreebie: boolean;
  }) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ReadingForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: BookFormProps) {
  const [tiles, setTiles] = useState<string[]>(initialData.tiles);
  const [isFreebie, setIsFreebie] = useState(initialData.isFreebie);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    await onSubmit({ tiles, isFreebie });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-surface-container px-3 py-2">
        <p className="text-sm font-medium text-on-surface">
          {initialData.title}
        </p>
        <p className="text-sm text-on-surface-variant">{initialData.author}</p>
      </div>

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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
