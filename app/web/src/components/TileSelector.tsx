import { useState, useMemo } from 'react';
import { TILES } from '@core/constants';
import { MAX_TILES_PER_BOOK } from '@core/validation';

interface TileSelectorProps {
  selectedTiles: string[];
  onChange: (tiles: string[]) => void;
  isFreebie: boolean;
}

const bookAssignableTiles = TILES.filter((t) => !t.isManual);

export function TileSelector({ selectedTiles, onChange, isFreebie }: TileSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredTiles = useMemo(() => {
    if (!search.trim()) return bookAssignableTiles;
    const term = search.toLowerCase();
    return bookAssignableTiles.filter((t) => t.name.toLowerCase().includes(term));
  }, [search]);

  const atLimit = !isFreebie && selectedTiles.length >= MAX_TILES_PER_BOOK;

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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Tiles {isFreebie ? '(unlimited)' : `(up to ${MAX_TILES_PER_BOOK})`}
      </label>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tiles..."
        className="w-full px-3 py-2 mb-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
      />
      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
        {filteredTiles.map((tile) => {
          const isSelected = selectedTiles.includes(tile.id);
          const isDisabled = atLimit && !isSelected;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleToggle(tile.id)}
              disabled={isDisabled}
              className={`px-2 py-1.5 rounded text-sm text-left transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 text-gray-800 hover:bg-gray-100'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {tile.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}