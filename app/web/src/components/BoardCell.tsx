interface BoardCellProps {
  tileName: string;
  bookCount: number;
  onClick: () => void;
}

function cellColor(count: number): string {
  if (count === 0)
    return 'bg-surface-container-lowest text-on-surface-variant border-outline-variant';
  if (count === 1)
    return 'bg-primary/10 text-on-primary-container border-primary/20';
  if (count === 2)
    return 'bg-primary/20 text-on-primary-container border-primary/30';
  return 'bg-primary/30 text-on-primary-container border-primary/40';
}

export function BoardCell({ tileName, bookCount, onClick }: BoardCellProps) {
  return (
    <button
      onClick={onClick}
      title={tileName}
      className={`aspect-square overflow-hidden rounded-sm border shadow-sm p-1.5 sm:p-2 text-sm leading-tight relative cursor-pointer hover:ring-2 hover:ring-primary transition-all flex items-center justify-center text-center ${cellColor(bookCount)}`}
    >
      <span className="line-clamp-3">{tileName}</span>
      {bookCount > 0 && (
        <span className="absolute top-0.5 right-1 text-xs font-semibold">
          {bookCount}
        </span>
      )}
    </button>
  );
}
