import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import type { ChallengeStatus, MemberRole } from '../types/challenges';
import { ChallengeSettingsPage } from './ChallengeSettingsPage';

vi.mock('../data/challenges', () => ({
  updateChallengeConfig: vi.fn(),
  setChallengeStatus: vi.fn(),
  deleteChallenge: vi.fn(),
}));

import {
  deleteChallenge,
  setChallengeStatus,
  updateChallengeConfig,
} from '../data/challenges';

const updateMock = vi.mocked(updateChallengeConfig);
const statusMock = vi.mocked(setChallengeStatus);
const deleteMock = vi.mocked(deleteChallenge);

beforeEach(() => {
  updateMock.mockReset();
  updateMock.mockResolvedValue(undefined);
  statusMock.mockReset();
  statusMock.mockResolvedValue(undefined);
  deleteMock.mockReset();
  deleteMock.mockResolvedValue(undefined);
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

  it('offers an owner the one step the lifecycle allows', () => {
    renderSettings('draft', 'owner');

    expect(
      screen.getByRole('button', { name: 'Start challenge' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Finish challenge' }),
    ).not.toBeInTheDocument();
  });

  it('offers a finished challenge no further step, but still a delete', () => {
    renderSettings('complete', 'owner');

    expect(screen.queryByText('Lifecycle')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete challenge' }),
    ).toBeInTheDocument();
  });

  it('keeps lifecycle and delete away from an admin', () => {
    renderSettings('draft', 'admin');

    expect(
      screen.queryByRole('button', { name: 'Start challenge' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete challenge' }),
    ).not.toBeInTheDocument();
  });

  it('starts the challenge only after the confirmation is accepted', async () => {
    const { user } = renderSettings('draft', 'owner');

    await user.click(screen.getByRole('button', { name: 'Start challenge' }));
    expect(statusMock).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Start challenge',
      }),
    );

    expect(statusMock).toHaveBeenCalledWith({
      challengeId: 'ch-main',
      status: 'active',
    });
    expect(await screen.findByText('Challenge started.')).toBeInTheDocument();
  });

  it('asks for the next status, not the current one, when finishing', async () => {
    const { user } = renderSettings('active', 'owner');

    await user.click(screen.getByRole('button', { name: 'Finish challenge' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Finish challenge',
      }),
    );

    expect(statusMock).toHaveBeenCalledWith({
      challengeId: 'ch-main',
      status: 'complete',
    });
    expect(await screen.findByText('Challenge finished.')).toBeInTheDocument();
  });

  it('deletes only after the confirmation is accepted', async () => {
    const { user } = renderSettings('active', 'owner');

    await user.click(screen.getByRole('button', { name: 'Delete challenge' }));
    expect(deleteMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMock).toHaveBeenCalledWith({ challengeId: 'ch-main' });
  });

  it('surfaces the refusal when a challenge still holds books', async () => {
    deleteMock.mockRejectedValue(
      new Error('Delete the books in this challenge first.'),
    );
    const { user } = renderSettings('active', 'owner');

    await user.click(screen.getByRole('button', { name: 'Delete challenge' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText('Delete the books in this challenge first.'),
    ).toBeInTheDocument();
  });
});
