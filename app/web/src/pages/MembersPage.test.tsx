import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeMember, makeSummary } from '../testing/challengeFixtures';
import type { ChallengeSummary, Member } from '../types/challenges';
import { MembersPage } from './MembersPage';

vi.mock('../data/challenges', () => ({
  getChallenge: vi.fn(),
  leaveChallenge: vi.fn(),
  rotateJoinCode: vi.fn(),
}));

import {
  getChallenge,
  leaveChallenge,
  rotateJoinCode,
} from '../data/challenges';

const getMock = vi.mocked(getChallenge);
const leaveMock = vi.mocked(leaveChallenge);
const rotateMock = vi.mocked(rotateJoinCode);

const JOIN_CODE = 'BNG02026';

const ACTIVE = makeSummary({ id: 'ch-main' }, { role: 'admin' });

beforeEach(() => {
  getMock.mockReset();
  leaveMock.mockReset();
  rotateMock.mockReset();
});

function resolveDetail(summary: ChallengeSummary, members: Member[]) {
  getMock.mockResolvedValue({
    challenge: summary.challenge,
    members,
    joinCode: JOIN_CODE,
  });
}

function renderMembers(summary: ChallengeSummary = ACTIVE) {
  return renderInChallenge(<MembersPage />, {
    challenges: [summary],
    active: summary,
  });
}

describe('MembersPage', () => {
  it('names every member on the roster', async () => {
    resolveDetail(ACTIVE, [
      makeMember({ userId: 'u-dana', name: 'Dana Whitfield' }),
      makeMember({ userId: 'u-priya', name: 'Priya Raghunathan' }),
    ]);

    renderMembers();

    expect(await screen.findByText('Dana Whitfield')).toBeInTheDocument();
    expect(screen.getByText('Priya Raghunathan')).toBeInTheDocument();
  });

  it('badges an elevated role and leaves a plain member unbadged', async () => {
    resolveDetail(ACTIVE, [
      makeMember({ userId: 'u-a', name: 'Ada', role: 'owner' }),
      makeMember({ userId: 'u-b', name: 'Bo', role: 'admin' }),
      makeMember({ userId: 'u-c', name: 'Cy', role: 'member' }),
    ]);

    renderMembers();

    expect(await screen.findByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Member')).not.toBeInTheDocument();
  });

  it('reports a failed roster read rather than an empty roster', async () => {
    getMock.mockRejectedValue(new Error('Network error'));

    renderMembers();

    expect(await screen.findByText('Error: Network error')).toBeInTheDocument();
  });

  it('shows a plain member the join code but no way to replace it', async () => {
    const summary = makeSummary({ id: 'ch-main' }, { role: 'member' });
    resolveDetail(summary, [makeMember()]);

    renderMembers(summary);

    expect(await screen.findByText('BNG0 2026')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Replace' }),
    ).not.toBeInTheDocument();
  });

  it('replaces the code for an admin', async () => {
    resolveDetail(ACTIVE, [makeMember()]);
    rotateMock.mockResolvedValue({ joinCode: 'WXYZ3456' });

    renderMembers();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace' }),
    );

    expect(rotateMock).toHaveBeenCalledWith({ challengeId: 'ch-main' });
  });

  it('offers no code and no exit once the challenge is complete', async () => {
    const summary = makeSummary(
      { id: 'ch-main', status: 'complete' },
      { role: 'admin' },
    );
    resolveDetail(summary, [makeMember({ name: 'Ada' })]);

    renderMembers(summary);

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.queryByText('BNG0 2026')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Leave challenge' }),
    ).not.toBeInTheDocument();
  });

  it('leaves only after the confirmation is accepted', async () => {
    resolveDetail(ACTIVE, [makeMember()]);
    leaveMock.mockResolvedValue(undefined);

    renderMembers();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Leave challenge' }),
    );
    expect(leaveMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(leaveMock).toHaveBeenCalledWith({ challengeId: 'ch-main' });
  });

  it('keeps the member in place when the server refuses the last owner', async () => {
    resolveDetail(ACTIVE, [makeMember()]);
    leaveMock.mockRejectedValue(
      new Error('The last owner cannot leave. Promote another owner first.'),
    );

    renderMembers();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Leave challenge' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(
      await screen.findByText(
        'The last owner cannot leave. Promote another owner first.',
      ),
    ).toBeInTheDocument();
  });
});
