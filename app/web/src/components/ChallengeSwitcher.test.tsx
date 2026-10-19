import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeSwitcher } from './ChallengeSwitcher';

vi.mock('../data/challenges', () => ({
  listMyChallenges: vi.fn(),
}));

import { listMyChallenges } from '../data/challenges';

const listMock = vi.mocked(listMyChallenges);

const MAIN = makeSummary(
  { id: 'ch-main', name: '2026 Book Bingo' },
  { role: 'owner' },
);

const AUTUMN = makeSummary(
  { id: 'ch-autumn', name: 'Short Story Autumn', status: 'draft' },
  { role: 'member' },
);

beforeEach(() => {
  listMock.mockReset();
});

function renderSwitcher(route: string) {
  const user = userEvent.setup();
  renderInChallenge(<ChallengeSwitcher />, { route });
  return { user };
}

describe('ChallengeSwitcher', () => {
  it('names the challenge the route points at', async () => {
    listMock.mockResolvedValue([MAIN, AUTUMN]);

    renderSwitcher('/c/ch-autumn');

    expect(
      await screen.findByRole('button', {
        name: 'Challenge: Short Story Autumn',
      }),
    ).toBeInTheDocument();
  });

  it('renders nothing when the user has no memberships', async () => {
    listMock.mockResolvedValue([]);

    renderSwitcher('/');

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers every membership plus the list, create and join entries', async () => {
    listMock.mockResolvedValue([MAIN, AUTUMN]);
    const { user } = renderSwitcher('/c/ch-main');

    await user.click(
      await screen.findByRole('button', { name: 'Challenge: 2026 Book Bingo' }),
    );

    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: /2026 Book Bingo/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /Short Story Autumn/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'All challenges' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Create a challenge' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Join with a code' }),
    ).toBeInTheDocument();
  });

  it('switches the active challenge when another is chosen', async () => {
    listMock.mockResolvedValue([MAIN, AUTUMN]);
    const { user } = renderSwitcher('/c/ch-main');

    await user.click(
      await screen.findByRole('button', { name: 'Challenge: 2026 Book Bingo' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /Short Story Autumn/ }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'Challenge: Short Story Autumn',
      }),
    ).toBeInTheDocument();
  });
});
