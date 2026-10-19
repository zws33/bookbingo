import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeListPage } from './ChallengeListPage';

vi.mock('../data/challenges', () => ({
  listMyChallenges: vi.fn(),
}));

import { listMyChallenges } from '../data/challenges';

const listMock = vi.mocked(listMyChallenges);

beforeEach(() => {
  listMock.mockReset();
});

describe('ChallengeListPage', () => {
  it('offers both ways in when there is no membership', async () => {
    listMock.mockResolvedValue([]);

    renderInChallenge(<ChallengeListPage />, { route: '/challenges' });

    expect(
      await screen.findByRole('link', { name: 'Create a challenge' }),
    ).toHaveAttribute('href', '/challenges/new');
    expect(
      screen.getByRole('link', { name: 'Join with a code' }),
    ).toHaveAttribute('href', '/challenges/join');
  });

  it('links each membership to its challenge', async () => {
    listMock.mockResolvedValue([
      makeSummary({ id: 'ch-main', name: '2026 Book Bingo' }),
      makeSummary({
        id: 'ch-autumn',
        name: 'Short Story Autumn',
        status: 'draft',
      }),
    ]);

    renderInChallenge(<ChallengeListPage />, { route: '/challenges' });

    expect(
      await screen.findByRole('link', { name: /2026 Book Bingo/ }),
    ).toHaveAttribute('href', '/c/ch-main');
    expect(
      screen.getByRole('link', { name: /Short Story Autumn/ }),
    ).toHaveAttribute('href', '/c/ch-autumn');
  });

  it('marks a draft challenge as not started', async () => {
    listMock.mockResolvedValue([
      makeSummary({
        id: 'ch-autumn',
        name: 'Short Story Autumn',
        status: 'draft',
      }),
    ]);

    renderInChallenge(<ChallengeListPage />, { route: '/challenges' });

    expect(await screen.findByText('Not started')).toBeInTheDocument();
  });

  it('badges an elevated role and leaves a plain member unbadged', async () => {
    listMock.mockResolvedValue([
      makeSummary({ id: 'ch-main' }, { role: 'owner' }),
      makeSummary(
        { id: 'ch-autumn', name: 'Short Story Autumn' },
        { role: 'member' },
      ),
    ]);

    renderInChallenge(<ChallengeListPage />, { route: '/challenges' });

    expect(await screen.findByText('Owner')).toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });
});
