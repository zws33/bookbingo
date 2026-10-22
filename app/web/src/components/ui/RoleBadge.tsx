import { cn } from '../../lib/cn.js';
import type { MemberRole } from '../../types/challenges';

/** `member` is the unmarked case — badging everyone says nothing. */
const LABELS: Record<MemberRole, string | undefined> = {
  owner: 'Owner',
  admin: 'Admin',
  member: undefined,
};

const classes: Record<MemberRole, string> = {
  owner: 'border-outline text-on-surface',
  admin: 'border-outline-variant text-on-surface-variant',
  member: '',
};

interface RoleBadgeProps {
  role: MemberRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const label = LABELS[role];
  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5',
        'text-[10px] font-semibold uppercase leading-none tracking-wide',
        classes[role],
        className,
      )}
    >
      {label}
    </span>
  );
}
