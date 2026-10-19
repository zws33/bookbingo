import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeSwitcher } from './ChallengeSwitcher';

const MAIN = makeSummary(
  { id: 'ch-main', name: '2026 Book Bingo' },
  { role: 'owner' },
);

const AUTUMN = makeSummary(
  { id: 'ch-autumn', name: 'Short Story Autumn', status: 'draft' },
  { role: 'member' },
);

function renderSwitcher(options: Parameters<typeof renderInChallenge>[1] = {}) {
  const user = userEvent.setup();
  renderInChallenge(<ChallengeSwitcher />, options);
  return { user };
}

async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('button', { name: `Challenge: ${name}` }));
  return screen.findByRole('menu');
}

describe('ChallengeSwitcher', () => {
  it('names the active challenge on the trigger', () => {
    renderSwitcher({ challenges: [MAIN, AUTUMN], active: AUTUMN });

    expect(
      screen.getByRole('button', { name: 'Challenge: Short Story Autumn' }),
    ).toBeInTheDocument();
  });

  it('prompts for a choice when none is active', () => {
    renderSwitcher({ challenges: [MAIN, AUTUMN] });

    expect(
      screen.getByRole('button', { name: 'Challenge: Choose a challenge' }),
    ).toBeInTheDocument();
  });

  it('renders nothing when the user has no memberships', () => {
    renderSwitcher({ challenges: [] });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing while the memberships are still loading', () => {
    renderSwitcher({ challenges: [MAIN], active: MAIN, loading: true });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links every membership to its challenge', async () => {
    const { user } = renderSwitcher({
      challenges: [MAIN, AUTUMN],
      active: MAIN,
    });

    const menu = await openMenu(user, '2026 Book Bingo');

    expect(
      within(menu).getByRole('menuitem', { name: /2026 Book Bingo/ }),
    ).toHaveAttribute('href', '/c/ch-main');
    expect(
      within(menu).getByRole('menuitem', { name: /Short Story Autumn/ }),
    ).toHaveAttribute('href', '/c/ch-autumn');
  });

  it('offers the list, create and join entries below the memberships', async () => {
    const { user } = renderSwitcher({ challenges: [MAIN], active: MAIN });

    const menu = await openMenu(user, '2026 Book Bingo');

    expect(
      within(menu).getByRole('menuitem', { name: 'All challenges' }),
    ).toHaveAttribute('href', '/challenges');
    expect(
      within(menu).getByRole('menuitem', { name: 'Create a challenge' }),
    ).toHaveAttribute('href', '/challenges/new');
    expect(
      within(menu).getByRole('menuitem', { name: 'Join with a code' }),
    ).toHaveAttribute('href', '/challenges/join');
  });
});
