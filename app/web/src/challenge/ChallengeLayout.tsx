import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useChallenges } from './ChallengeContext';
import { writeLastChallengeId } from './lastChallenge';
import { atLeast } from './permissions';
import { PageStatus } from '../components/PageStatus';
import { buttonClasses } from '../components/ui/Button.js';

interface Tab {
  to: string;
  label: string;
  end: boolean;
}

const TABS: Tab[] = [
  { to: '.', label: 'My Books', end: true },
  { to: 'reading-list', label: 'Reading List', end: false },
  { to: 'board', label: 'Bingo Board', end: false },
  { to: 'leaderboard', label: 'Leaderboard', end: false },
  { to: 'members', label: 'Members', end: false },
];

function tabClass({ isActive }: { isActive: boolean }): string {
  return `pb-2 text-sm font-medium whitespace-nowrap ${
    isActive
      ? 'border-b-2 border-primary text-primary'
      : 'text-on-surface-variant hover:text-on-surface'
  }`;
}

function NotFound() {
  return (
    <div className="text-center py-12">
      <h2 className="font-display text-xl font-semibold text-on-surface">
        Challenge not found
      </h2>
      <p className="text-on-surface-variant mt-1 mb-6">
        It may have been deleted, or you may no longer be a member.
      </p>
      <Link to="/challenges" className={buttonClasses('outline')}>
        Your challenges
      </Link>
    </div>
  );
}

/**
 * Everything under `/c/:challengeId`. Resolving here rather than per page
 * means a page body never renders against a challenge the user is not in.
 */
export function ChallengeLayout() {
  const { active, loading, error } = useChallenges();
  const activeId = active?.challenge.id;

  useEffect(() => {
    if (activeId) {
      writeLastChallengeId(activeId);
    }
  }, [activeId]);

  if (loading || error) {
    return <PageStatus loading={loading} error={error} />;
  }

  if (!active) {
    return <NotFound />;
  }

  const { challenge, membership } = active;
  // Settings is admin-only even when the lifecycle has locked every field on
  // it: a complete challenge still shows its cap and roster rules.
  const tabs = atLeast(membership.role, 'admin')
    ? [...TABS, { to: 'settings', label: 'Settings', end: false }]
    : TABS;

  return (
    <>
      {challenge.status !== 'active' && (
        <div className="mb-4 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          {challenge.status === 'draft'
            ? 'This challenge has not started. Readings open once an owner starts it.'
            : 'This challenge is finished. Its books and scores are read-only.'}
        </div>
      )}

      <div className="flex gap-4 border-b border-outline-variant mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </>
  );
}
