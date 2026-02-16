import { getTileById } from '@bookbingo/lib-core';

interface BookRowProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  isFreebie: boolean;
  onClick?: () => void;
  readOnly?: boolean;
}

const MAX_DOTS = 5;

export function BookRow({ bookTitle, bookAuthor, tiles, isFreebie, onClick, readOnly }: BookRowProps) {
  const visibleTiles = tiles.slice(0, MAX_DOTS);
  const overflow = tiles.length - MAX_DOTS;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3${readOnly ? '' : ' cursor-pointer hover:bg-gray-50'} transition-colors`}
      onClick={readOnly ? undefined : onClick}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : (e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{bookTitle}</span>
          {isFreebie && (
            <span className="text-yellow-500 flex-shrink-0" title="Freebie">
              ★
            </span>
          )}
        </div>
        <span className="text-sm text-gray-500 truncate block">{bookAuthor}</span>
      </div>
      {tiles.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {visibleTiles.map((tile) => {
            const name = getTileById(tile)?.name ?? tile;
            return (
              <span
                key={tile}
                title={name}
                className="w-2 h-2 rounded-full bg-blue-500"
              />
            );
          })}
          {overflow > 0 && (
            <span className="text-xs text-gray-400">+{overflow}</span>
          )}
        </div>
      )}
    </div>
  );
}
