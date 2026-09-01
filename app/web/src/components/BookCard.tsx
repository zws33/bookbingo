import type { ReactNode } from 'react';
import type { BookMetadata } from '@bookbingo/lib-types';
import { TileBadge } from './ui/index.js';

interface BookCardProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  metadata?: BookMetadata | undefined;
  notes?: string | undefined;
  /** When set (and not read-only / no footer), the whole card is a button. */
  onClick?: () => void;
  readOnly?: boolean;
  /** Action row rendered below a divider (e.g. Reading List). Makes the card static. */
  footer?: ReactNode;
}

// Cap visible tags so the badge row stays aligned to the bottom of the cover.
// Non-freebie books have <= 3 tiles; freebies can exceed it and show "+N".
const MAX_BADGES = 3;

export function BookCard({
  bookTitle,
  bookAuthor,
  tiles,
  metadata,
  notes,
  onClick,
  readOnly,
  footer,
}: BookCardProps) {
  const thumbnailUrl = metadata?.thumbnailUrl ?? null;
  const visibleTiles = tiles.slice(0, MAX_BADGES);
  const overflow = tiles.length - MAX_BADGES;
  const interactive = !readOnly && !footer;

  return (
    <div
      className={`overflow-hidden rounded-lg bg-surface-container-lowest p-4 shadow transition-shadow${interactive ? ' cursor-pointer hover:shadow-md' : ''}`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive ? (e) => e.key === 'Enter' && onClick?.() : undefined
      }
    >
      <div className="flex gap-4">
        {/* Cover — prominent 2:3; the fixed height the content column aligns to */}
        <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-container-high text-on-surface-variant">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span aria-hidden className="text-4xl">
              📖
            </span>
          )}
        </div>
        {/* Content — matches cover height: title top-aligns, tags (mt-auto) bottom-align */}
        <div className="flex min-h-36 min-w-0 flex-1 flex-col">
          <div>
            <h3 className="font-display text-headline-sm text-on-surface line-clamp-2">
              {bookTitle}
            </h3>
            <p className="mt-1 truncate text-sm italic text-on-surface-variant">
              by {bookAuthor}
            </p>
            {notes && (
              <p className="mt-1 line-clamp-2 text-sm italic text-on-surface-variant">
                {notes}
              </p>
            )}
          </div>
          {tiles.length > 0 && (
            <div className="mt-auto flex min-w-0 flex-wrap gap-1 pt-2">
              {visibleTiles.map((tile) => (
                <TileBadge
                  key={tile}
                  tileId={tile}
                  className="max-w-full truncate"
                />
              ))}
              {overflow > 0 && (
                <span className="inline-flex items-center rounded-sm border border-outline-variant px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-on-surface-variant">
                  +{overflow}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {footer && (
        <div className="mt-3 border-t border-outline-variant pt-3">
          {footer}
        </div>
      )}
    </div>
  );
}
