import { Link } from 'react-router-dom';
import { useChallenges } from '../challenge/ChallengeContext';
import { ChevronIcon } from './ui/ChevronIcon.js';
import { DropdownMenu } from './ui/DropdownMenu.js';
import { RoleBadge } from './ui/RoleBadge.js';
import { StatusChip } from './ui/StatusChip.js';

function ChevronIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0 text-on-surface-variant"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The fast path between challenges. `/challenges` is the full list; this is
 * the one-click version, so it names the active challenge rather than a verb.
 *
 * Entries are links, not click handlers, so middle-click and open-in-new-tab
 * work. The routes they point at arrive with the challenge routing change.
 *
 * Rendered only when the user has a membership — with none there is nothing
 * to switch between, and onboarding is the whole screen instead.
 */
export function ChallengeSwitcher() {
  const { challenges, active, loading } = useChallenges();

  if (loading || challenges.length === 0) {
    return null;
  }

  const label = active?.challenge.name ?? 'Choose a challenge';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={`Challenge: ${label}`}>
        <span className="font-display text-sm font-semibold truncate max-w-40 sm:max-w-64">
          {label}
        </span>
        {active && <StatusChip status={active.challenge.status} />}
        <ChevronIcon className="text-on-surface-variant" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.Label>Your challenges</DropdownMenu.Label>
        {challenges.map(({ challenge, membership }) => (
          <DropdownMenu.Item key={challenge.id} asChild>
            <Link to={`/c/${challenge.id}`}>
              <span
                aria-hidden="true"
                className={
                  challenge.id === active?.challenge.id
                    ? 'text-primary'
                    : 'text-transparent'
                }
              >
                ✓
              </span>
              <span className="flex-1 truncate">{challenge.name}</span>
              <RoleBadge role={membership.role} />
              <StatusChip status={challenge.status} />
            </Link>
          </DropdownMenu.Item>
        ))}

        <DropdownMenu.Separator />
        <DropdownMenu.Item asChild>
          <Link to="/challenges">All challenges</Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Link to="/challenges/new">Create a challenge</Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild>
          <Link to="/challenges/join">Join with a code</Link>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
