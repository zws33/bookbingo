import { getTileById } from '@bookbingo/lib-core';

interface BookCardProps {
  bookTitle: string;
  bookAuthor: string;
  tiles: string[];
  onClick: () => void;
}

const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max) + '…' : s;

export function BookCard({ bookTitle, bookAuthor, tiles, onClick }: BookCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <h3 className="font-semibold text-gray-900 truncate">{bookTitle}</h3>
      <p className="text-sm text-gray-600 mt-1">by {bookAuthor}</p>
      {tiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tiles.map((tile) => {
            const name = getTileById(tile)?.name ?? tile;
            return (
              <span
                key={tile}
                title={name}
                className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
              >
                {truncate(name, 25)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
