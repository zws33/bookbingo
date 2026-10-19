import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { JoinChallengePage } from './JoinChallengePage';

vi.mock('../data/challenges', () => ({
  joinChallenge: vi.fn(),
}));

import { joinChallenge } from '../data/challenges';

const joinMock = vi.mocked(joinChallenge);

beforeEach(() => {
  joinMock.mockReset();
});

function renderPage() {
  const user = userEvent.setup();
  renderInChallenge(<JoinChallengePage />, { route: '/challenges/join' });
  return { user };
}

describe('JoinChallengePage', () => {
  it('rejects a code of the wrong length without calling the server', async () => {
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Join code'), 'BNG02');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText('A join code is 8 letters and numbers.'),
    ).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('normalizes the typed code before sending it', async () => {
    joinMock.mockResolvedValue({ challengeId: 'ch-main' });
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Join code'), 'bng0-2o26');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(joinMock).toHaveBeenCalledWith('BNG02026');
  });

  it('shows the rejection when no challenge matches', async () => {
    joinMock.mockRejectedValue(new Error('No challenge matches that code.'));
    const { user } = renderPage();

    await user.type(screen.getByLabelText('Join code'), 'BNG02026');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(
      await screen.findByText('No challenge matches that code.'),
    ).toBeInTheDocument();
  });
});
