import type { BookMetadata } from '@bookbingo/lib-types';
import { getTileById } from '@bookbingo/lib-core';

interface BookRowProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  isFreebie: boolean;
  metadata?: BookMetadata | undefined;
  onClick?: () => void;
  readOnly?: boolean;
}

const MAX_DOTS = 5;

export function BookRow({
  bookTitle,
  bookAuthor,
  tiles,
  isFreebie,
  metadata,
  onClick,
  readOnly,
}: BookRowProps) {
  const visibleTiles = tiles.slice(0, MAX_DOTS);
  const overflow = tiles.length - MAX_DOTS;
  const thumbnailUrl = metadata?.thumbnailUrl ?? null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3${readOnly ? '' : ' cursor-pointer hover:bg-surface-container'} transition-colors`}
      onClick={readOnly ? undefined : onClick}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : (e) => e.key === 'Enter' && onClick?.()}
    >
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          className="w-7 h-10 object-cover rounded-sm shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-medium text-on-surface truncate">
            {bookTitle}
          </span>
          {isFreebie && (
            <span className="text-yellow-500 shrink-0" title="Freebie">
              ★
            </span>
          )}
        </div>
        <span className="text-sm italic text-on-surface-variant truncate block">
          {bookAuthor}
        </span>
      </div>
      {tiles.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {visibleTiles.map((tile) => {
            const name = getTileById(tile)?.name ?? tile;
            return (
              <span
                key={tile}
                title={name}
                className="w-2 h-2 rounded-full bg-primary"
              />
            );
          })}
          {overflow > 0 && (
            <span className="text-xs text-on-surface-variant">+{overflow}</span>
          )}
        </div>
      )}
    </div>
  );
}
