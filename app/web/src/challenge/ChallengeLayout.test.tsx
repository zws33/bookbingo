import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import type { ChallengeStatus, MemberRole } from '../types/challenges';
import { ChallengeLayout } from './ChallengeLayout';
import { readLastChallengeId } from './lastChallenge';

const routes = (
  <Routes>
    <Route path="/c/:challengeId" element={<ChallengeLayout />}>
      <Route index element={<div>my books</div>} />
    </Route>
  </Routes>
);

function renderLayout({
  role = 'member' as MemberRole,
  status = 'active' as ChallengeStatus,
  member = true,
} = {}) {
  const summary = makeSummary({ id: 'ch-1', status }, { role });
  return renderInChallenge(routes, {
    route: '/c/ch-1',
    challenges: member ? [summary] : [],
    active: member ? summary : undefined,
  });
}

describe('ChallengeLayout', () => {
  afterEach(() => window.localStorage.clear());

  it('renders the page under its tabs', () => {
    renderLayout();

    expect(screen.getByText('my books')).toBeInTheDocument();
    for (const tab of [
      'My Books',
      'Reading List',
      'Bingo Board',
      'Leaderboard',
      'Library',
      'Members',
    ]) {
      expect(screen.getByRole('link', { name: tab })).toBeInTheDocument();
    }
  });

  it('keeps settings out of a member’s tabs', () => {
    renderLayout({ role: 'member' });

    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
  });

  for (const role of ['admin', 'owner'] as const) {
    it(`offers settings to an ${role}`, () => {
      renderLayout({ role });

      expect(
        screen.getByRole('link', { name: 'Settings' }),
      ).toBeInTheDocument();
    });
  }

  it('tells a non-member the challenge was not found', () => {
    renderLayout({ member: false });

    expect(
      screen.getByRole('heading', { name: 'Challenge not found' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('my books')).not.toBeInTheDocument();
  });

  it('says a draft challenge has not started', () => {
    renderLayout({ status: 'draft' });

    expect(screen.getByText(/has not started/)).toBeInTheDocument();
  });

  it('says a complete challenge is read-only', () => {
    renderLayout({ status: 'complete' });

    expect(screen.getByText(/finished/)).toBeInTheDocument();
  });

  it('says nothing about the lifecycle of an active challenge', () => {
    renderLayout({ status: 'active' });

    expect(screen.queryByText(/has not started/)).not.toBeInTheDocument();
    expect(screen.queryByText(/finished/)).not.toBeInTheDocument();
  });

  it('remembers the challenge it opened, for the next sign-in', () => {
    renderLayout();

    expect(readLastChallengeId()).toBe('ch-1');
  });

  it('remembers nothing when the challenge did not resolve', () => {
    renderLayout({ member: false });

    expect(readLastChallengeId()).toBeUndefined();
  });
});
