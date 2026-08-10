import { getTileById } from '@bookbingo/lib-core';
import { cn } from '../../lib/cn.js';

interface TileBadgeProps {
  tileId: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}

const variantClasses = {
  primary: 'border-primary/40 text-primary',
  secondary: 'border-outline-variant text-on-surface-variant',
};

export function TileBadge({
  tileId,
  variant = 'primary',
  className,
}: TileBadgeProps) {
  const name = getTileById(tileId)?.name ?? tileId;
  return (
    <span
      title={name}
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide',
        variantClasses[variant],
        className,
      )}
    >
      {name}
    </span>
  );
}
