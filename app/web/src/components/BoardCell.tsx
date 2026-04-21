interface BoardCellProps {
  tileName: string;
  bookCount: number;
  onClick: () => void;
}

function cellColor(count: number): string {
  if (count === 0) return 'bg-white text-gray-500 border-gray-200';
  if (count === 1) return 'bg-blue-50 text-blue-800 border-blue-100';
  if (count === 2) return 'bg-blue-100 text-blue-900 border-blue-200';
  return 'bg-blue-200 text-blue-900 border-blue-300';
}

export function BoardCell({ tileName, bookCount, onClick }: BoardCellProps) {
  return (
    <button
      onClick={onClick}
      title={tileName}
      className={`aspect-square overflow-hidden rounded border shadow-sm p-1.5 sm:p-2 text-xs sm:text-sm leading-tight relative cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all flex items-center justify-center text-center ${cellColor(bookCount)}`}
    >
      <span className="line-clamp-3">{tileName}</span>
      {bookCount > 0 && (
        <span className="absolute top-0.5 right-1 text-[10px] sm:text-xs font-semibold">
          {bookCount}
        </span>
      )}
    </button>
  );
}
