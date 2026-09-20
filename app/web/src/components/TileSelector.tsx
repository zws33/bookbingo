import { useState, useMemo } from 'react';
import { useTileCatalog } from '../hooks/useTileCatalog';
import { cn } from '../lib/cn.js';
import { Input, Label } from './ui/index.js';

interface TileSelectorProps {
  selectedTiles: string[];
  onChange: (tiles: string[]) => void;
  isFreebie: boolean;
}
type TileSelectorItem = {
  id: string;
  name: string;
  isSelected: boolean;
  isDisabled: boolean;
};

type TileButtonProps = {
  tile: TileSelectorItem;
  onToggle: (tileId: string) => void;
};

// Private to TileSelector: renders one toggle cell. Uses a raw <button> rather
// than the Button primitive because its base padding/alignment/variants don't
// fit a compact, left-aligned grid cell.
function TileButton({ tile, onToggle }: TileButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(tile.id)}
      disabled={tile.isDisabled}
      aria-pressed={tile.isSelected}
      className={cn(
        'px-2 py-1.5 rounded-sm text-sm text-left transition-colors',
        tile.isSelected
          ? 'bg-primary text-on-primary'
          : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high',
        tile.isDisabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {tile.name}
    </button>
  );
}

export function TileSelector({
  selectedTiles,
  onChange,
  isFreebie,
}: TileSelectorProps) {
  const [search, setSearch] = useState('');
  const { tiles, maxTilesPerBook } = useTileCatalog();

  // Until the catalog loads there is no cap to enforce, and no tiles to offer
  // either — so nothing is selectable and the limit cannot be reached.
  const atLimit =
    !isFreebie &&
    maxTilesPerBook !== undefined &&
    selectedTiles.length >= maxTilesPerBook;
  const filteredTiles = useMemo<TileSelectorItem[]>(() => {
    const items = tiles
      .map((t) => {
        const isSelected = selectedTiles.includes(t.id);
        const isDisabled = atLimit && !isSelected;
        return {
          isSelected,
          isDisabled,
          id: t.id,
          name: t.name,
        };
      })
      .sort((a, b) => Number(b.isSelected) - Number(a.isSelected));
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items.filter((t) => t.name.toLowerCase().includes(term));
  }, [search, selectedTiles, atLimit, tiles]);

  const handleToggle = (tileId: string) => {
    if (selectedTiles.includes(tileId)) {
      onChange(selectedTiles.filter((id) => id !== tileId));
    } else {
      if (atLimit) return;
      onChange([...selectedTiles, tileId]);
    }
  };

  return (
    <div>
      <Label className="mb-1">
        Tiles{' '}
        {isFreebie
          ? '(unlimited)'
          : maxTilesPerBook !== undefined && `(up to ${maxTilesPerBook})`}
      </Label>
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tiles..."
        className="mb-2 text-sm"
      />
      <div className="max-h-48 overflow-y-auto border border-outline-variant rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {filteredTiles.map((tile) => (
          <TileButton key={tile.id} tile={tile} onToggle={handleToggle} />
        ))}
      </div>
    </div>
  );
}
