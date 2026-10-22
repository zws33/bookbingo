import { Link } from 'react-router-dom';
import type { ChallengeSummary } from '../types/challenges';
import { RoleBadge } from './ui/RoleBadge.js';
import { StatusChip } from './ui/StatusChip.js';

const JOINED = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
});

interface ChallengeCardProps {
  summary: ChallengeSummary;
  isActive: boolean;
}

export function ChallengeCard({ summary, isActive }: ChallengeCardProps) {
  const { challenge, membership } = summary;

  return (
    <Link
      to={`/c/${challenge.id}`}
      className={`block rounded-lg border p-4 bg-surface-container-lowest transition-colors hover:bg-surface-container ${
        isActive ? 'border-primary' : 'border-outline-variant'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-on-surface">
          {challenge.name}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <RoleBadge role={membership.role} />
          <StatusChip status={challenge.status} />
        </div>
      </div>
      <p className="mt-2 text-sm text-on-surface-variant">
        Joined {JOINED.format(membership.joinedAt)} · up to {challenge.tagCap}{' '}
        {challenge.tagCap === 1 ? 'tag' : 'tags'} per book
      </p>
    </Link>
  );
}
