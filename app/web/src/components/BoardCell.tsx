interface BoardCellProps {
  tileName: string;
  bookCount: number;
  onClick: () => void;
}

const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max) + '…' : s;

function cellColor(count: number): string {
  if (count === 0) return 'bg-gray-100 text-gray-400';
  if (count === 1) return 'bg-blue-100 text-blue-800';
  if (count === 2) return 'bg-blue-200 text-blue-900';
  return 'bg-blue-300 text-blue-900';
}

export function BoardCell({ tileName, bookCount, onClick }: BoardCellProps) {
  return (
    <button
      onClick={onClick}
      title={tileName}
      className={`aspect-square rounded p-1.5 sm:p-2 text-xs sm:text-sm leading-tight relative cursor-pointer hover:ring-2 hover:ring-blue-400 transition-shadow flex items-center justify-center text-center ${cellColor(bookCount)}`}
    >
      <span>{truncate(tileName, 30)}</span>
      {bookCount > 0 && (
        <span className="absolute top-0.5 right-1 text-[10px] sm:text-xs font-semibold">
          {bookCount}
        </span>
      )}
    </button>
  );
}
