import { Reading } from '../types';

interface BookCardProps {
  reading: Reading;
}

export function BookCard({ reading }: BookCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-900 truncate">{reading.bookTitle}</h3>
      <p className="text-sm text-gray-600 mt-1">by {reading.bookAuthor}</p>
      {reading.tiles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {reading.tiles.map((tile) => (
            <span
              key={tile}
              className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded"
            >
              {tile}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}