import { getTileById } from '@bookbingo/lib-core';
import { cn } from '../../lib/cn.js';

interface TileBadgeProps {
  tileId: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}

const variantClasses = {
  primary: 'bg-primary-container text-on-primary-container px-2',
  secondary: 'bg-surface-container-high text-on-surface-variant px-1.5',
};

export function TileBadge({ tileId, variant = 'primary', className }: TileBadgeProps) {
  const name = getTileById(tileId)?.name ?? tileId;
  return (
    <span
      title={name}
      className={cn('inline-block text-xs py-0.5 rounded', variantClasses[variant], className)}
    >
      {name}
    </span>
  );
}
