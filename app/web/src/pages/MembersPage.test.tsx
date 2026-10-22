import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeMember, makeSummary } from '../testing/challengeFixtures';
import { MembersPage } from './MembersPage';

vi.mock('../data/challenges', () => ({
  getChallenge: vi.fn(),
}));

import { getChallenge } from '../data/challenges';

const getMock = vi.mocked(getChallenge);

const ACTIVE = makeSummary({ id: 'ch-main' }, { role: 'admin' });

beforeEach(() => {
  getMock.mockReset();
});

function renderMembers() {
  return renderInChallenge(<MembersPage />, {
    challenges: [ACTIVE],
    active: ACTIVE,
  });
}

describe('MembersPage', () => {
  it('names every member on the roster', async () => {
    getMock.mockResolvedValue({
      challenge: ACTIVE.challenge,
      members: [
        makeMember({ userId: 'u-dana', name: 'Dana Whitfield' }),
        makeMember({ userId: 'u-priya', name: 'Priya Raghunathan' }),
      ],
    });

    renderMembers();

    expect(await screen.findByText('Dana Whitfield')).toBeInTheDocument();
    expect(screen.getByText('Priya Raghunathan')).toBeInTheDocument();
  });

  it('badges an elevated role and leaves a plain member unbadged', async () => {
    getMock.mockResolvedValue({
      challenge: ACTIVE.challenge,
      members: [
        makeMember({ userId: 'u-a', name: 'Ada', role: 'owner' }),
        makeMember({ userId: 'u-b', name: 'Bo', role: 'admin' }),
        makeMember({ userId: 'u-c', name: 'Cy', role: 'member' }),
      ],
    });

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
});
