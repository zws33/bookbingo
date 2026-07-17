import type { BookMetadata } from '@bookbingo/lib-types';
import { TileBadge } from './ui/index.js';

interface BookCardProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  metadata?: BookMetadata;
  onClick?: () => void;
  readOnly?: boolean;
}

// Cap visible tags so the badge row stays aligned to the bottom of the cover.
// Non-freebie books have <= 3 tiles; freebies can exceed it and show "+N".
const MAX_BADGES = 3;

export function BookCard({ bookTitle, bookAuthor, tiles, metadata, onClick, readOnly }: BookCardProps) {
  const thumbnailUrl = metadata?.thumbnailUrl ?? null;
  const visibleTiles = tiles.slice(0, MAX_BADGES);
  const overflow = tiles.length - MAX_BADGES;

  return (
    <div
      className={`bg-surface-container-lowest rounded-lg shadow p-4 overflow-hidden${readOnly ? '' : ' cursor-pointer hover:shadow-md'} transition-shadow`}
      onClick={readOnly ? undefined : onClick}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : (e) => e.key === 'Enter' && onClick?.()}
    >
      <div className="flex gap-4">
        {/* Cover — prominent 2:3; the fixed height that the content column matches */}
        <div className="h-36 w-24 shrink-0 overflow-hidden rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span aria-hidden className="text-4xl">📖</span>
          )}
        </div>
        {/* Content — same height as cover: title top-aligns, badges (mt-auto) bottom-align */}
        <div className="flex h-36 min-w-0 flex-1 flex-col">
          <div>
            <h3 className="font-display text-headline-sm text-on-surface line-clamp-2">{bookTitle}</h3>
            <p className="mt-1 truncate text-sm italic text-on-surface-variant">by {bookAuthor}</p>
          </div>
          {tiles.length > 0 && (
            <div className="mt-auto flex min-w-0 flex-wrap gap-1">
              {visibleTiles.map((tile) => (
                <TileBadge key={tile} tileId={tile} className="max-w-full truncate" />
              ))}
              {overflow > 0 && (
                <span className="inline-flex items-center rounded border border-outline-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-on-surface-variant">
                  +{overflow}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
