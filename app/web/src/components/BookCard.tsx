import { TileBadge } from './ui/index.js';

interface BookCardProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  onClick?: () => void;
  readOnly?: boolean;
}

export function BookCard({ bookTitle, bookAuthor, tiles, onClick, readOnly }: BookCardProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow p-4 overflow-hidden${readOnly ? '' : ' cursor-pointer hover:shadow-md'} transition-shadow`}
      onClick={readOnly ? undefined : onClick}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : (e) => e.key === 'Enter' && onClick?.()}
    >
      <h3 className="font-semibold text-gray-900 truncate">{bookTitle}</h3>
      <p className="text-sm text-gray-600 mt-1">by {bookAuthor}</p>
      {tiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 min-w-0">
          {tiles.map((tile) => (
            <TileBadge key={tile} tileId={tile} className="min-w-0 max-w-full truncate" />
          ))}
        </div>
      )}
    </div>
  );
}
