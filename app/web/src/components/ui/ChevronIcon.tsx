import { cn } from '../../lib/cn.js';

interface ChevronIconProps {
  className?: string;
}

/**
 * Points down. A caller that needs another direction rotates it, the way
 * `Accordion.Trigger` flips it open — one path beats four near-identical ones.
 */
export function ChevronIcon({ className }: ChevronIconProps) {
  return (
    <svg
      className={cn('w-4 h-4 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}
