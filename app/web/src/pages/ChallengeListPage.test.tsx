import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeListPage } from './ChallengeListPage';

const ROUTE = '/challenges';

describe('ChallengeListPage', () => {
  it('offers both ways in when there is no membership', () => {
    renderInChallenge(<ChallengeListPage />, { route: ROUTE, challenges: [] });

    expect(
      screen.getByRole('link', { name: 'Create a challenge' }),
    ).toHaveAttribute('href', '/challenges/new');
    expect(
      screen.getByRole('link', { name: 'Join with a code' }),
    ).toHaveAttribute('href', '/challenges/join');
  });

  it('links each membership to its challenge', () => {
    renderInChallenge(<ChallengeListPage />, {
      route: ROUTE,
      challenges: [
        makeSummary({ id: 'ch-main', name: '2026 Book Bingo' }),
        makeSummary({
          id: 'ch-autumn',
          name: 'Short Story Autumn',
          status: 'draft',
        }),
      ],
    });

    expect(
      screen.getByRole('link', { name: /2026 Book Bingo/ }),
    ).toHaveAttribute('href', '/c/ch-main');
    expect(
      screen.getByRole('link', { name: /Short Story Autumn/ }),
    ).toHaveAttribute('href', '/c/ch-autumn');
  });

  it('marks a draft challenge as not started and a finished one as finished', () => {
    renderInChallenge(<ChallengeListPage />, {
      route: ROUTE,
      challenges: [
        makeSummary({ id: 'ch-draft', name: 'Autumn', status: 'draft' }),
        makeSummary({ id: 'ch-done', name: '2025', status: 'complete' }),
        makeSummary({ id: 'ch-live', name: '2026', status: 'active' }),
      ],
    });

    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('badges an elevated role and leaves a plain member unbadged', () => {
    renderInChallenge(<ChallengeListPage />, {
      route: ROUTE,
      challenges: [
        makeSummary({ id: 'ch-main' }, { role: 'owner' }),
        makeSummary({ id: 'ch-two', name: 'Two' }, { role: 'admin' }),
        makeSummary({ id: 'ch-three', name: 'Three' }, { role: 'member' }),
      ],
    });

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });

  it('reports a failed membership read instead of an empty list', () => {
    renderInChallenge(<ChallengeListPage />, {
      route: ROUTE,
      error: new Error('Network error'),
    });

    expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create a challenge' }),
    ).not.toBeInTheDocument();
  });
});
