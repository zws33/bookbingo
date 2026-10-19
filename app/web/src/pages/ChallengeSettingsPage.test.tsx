import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import type { ChallengeStatus, MemberRole } from '../types/challenges';
import { ChallengeSettingsPage } from './ChallengeSettingsPage';

vi.mock('../data/challenges', () => ({
  updateChallengeConfig: vi.fn(),
}));

import { updateChallengeConfig } from '../data/challenges';

const updateMock = vi.mocked(updateChallengeConfig);

beforeEach(() => {
  updateMock.mockReset();
  updateMock.mockResolvedValue(undefined);
});

function renderSettings(status: ChallengeStatus, role: MemberRole = 'admin') {
  const active = makeSummary(
    { id: 'ch-main', name: '2026 Book Bingo', tagCap: 3, status },
    { role },
  );
  const user = userEvent.setup();
  renderInChallenge(<ChallengeSettingsPage />, {
    challenges: [active],
    active,
  });
  return { user };
}

const name = () => screen.getByLabelText('Name');
const cap = () => screen.getByLabelText('Tags per book');
const save = () => screen.getByRole('button', { name: 'Save changes' });

describe('ChallengeSettingsPage', () => {
  it('leaves both fields editable while the challenge is a draft', () => {
    renderSettings('draft');

    expect(name()).toBeEnabled();
    expect(cap()).toBeEnabled();
  });

  it('locks the tag cap once the challenge starts but keeps the name editable', () => {
    renderSettings('active');

    expect(name()).toBeEnabled();
    expect(cap()).toBeDisabled();
    expect(
      screen.getByText(/locked once the challenge starts/),
    ).toBeInTheDocument();
  });

  it('locks both fields on a finished challenge', () => {
    renderSettings('complete');

    expect(name()).toBeDisabled();
    expect(cap()).toBeDisabled();
  });

  it('locks both fields for a plain member', () => {
    renderSettings('draft', 'member');

    expect(name()).toBeDisabled();
    expect(cap()).toBeDisabled();
  });

  it('disables saving until something changes', async () => {
    const { user } = renderSettings('draft');
    expect(save()).toBeDisabled();

    await user.type(name(), '!');

    expect(save()).toBeEnabled();
  });

  it('sends only the changed field, trimmed', async () => {
    const { user } = renderSettings('active');

    await user.clear(name());
    await user.type(name(), '  2027 Book Bingo  ');
    await user.click(save());

    expect(updateMock).toHaveBeenCalledWith({
      challengeId: 'ch-main',
      name: '2027 Book Bingo',
    });
  });

  it('refuses an empty name without calling the server', async () => {
    const { user } = renderSettings('active');

    await user.clear(name());
    await user.type(name(), '   ');
    await user.click(save());

    expect(
      await screen.findByText('A name is 1 to 100 characters.'),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
