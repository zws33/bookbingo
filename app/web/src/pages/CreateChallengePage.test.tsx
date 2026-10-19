import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { CreateChallengePage } from './CreateChallengePage';

vi.mock('../data/challenges', () => ({
  createChallenge: vi.fn(),
}));

import { createChallenge } from '../data/challenges';

const createMock = vi.mocked(createChallenge);

beforeEach(() => {
  createMock.mockReset();
});

function renderPage() {
  const user = userEvent.setup();
  renderInChallenge(<CreateChallengePage />, { route: '/challenges/new' });
  return { user };
}

describe('CreateChallengePage', () => {
  it('refuses a whitespace-only name', async () => {
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('Give the challenge a name.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses a tag cap below one', async () => {
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Name'), '2026 Book Bingo');
    await user.clear(screen.getByLabelText('Tags per book'));
    await user.type(screen.getByLabelText('Tags per book'), '0');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText(
        'The tag cap has to be a whole number of at least 1.',
      ),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('trims the name in the submitted payload', async () => {
    createMock.mockResolvedValue({
      challengeId: 'ch-new',
      joinCode: 'BNG02026',
    });
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Name'), '  2026 Book Bingo  ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createMock).toHaveBeenCalledWith({
      name: '2026 Book Bingo',
      tagCap: 3,
    });
  });
});
