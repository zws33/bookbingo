import { cn } from '../../lib/cn.js';
import type { ChallengeStatus } from '../../types/challenges';

/**
 * `active` is the unmarked case: chipping every challenge would make the two
 * that need attention — not started, finished — stop standing out.
 */
const LABELS: Record<ChallengeStatus, string | undefined> = {
  draft: 'Not started',
  active: undefined,
  complete: 'Finished',
};

const classes: Record<ChallengeStatus, string> = {
  draft: 'border-primary/40 text-primary',
  active: '',
  complete: 'border-outline-variant text-on-surface-variant',
};

interface StatusChipProps {
  status: ChallengeStatus;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const label = LABELS[status];
  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5',
        'text-[10px] font-semibold uppercase leading-none tracking-wide',
        classes[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
