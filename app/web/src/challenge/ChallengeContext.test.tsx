import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeProvider, useChallenges } from './ChallengeContext';

vi.mock('../data/challenges', () => ({
  getMyChallenges: vi.fn(),
}));

const { getMyChallenges } = await import('../data/challenges');
const listMemberships = vi.mocked(getMyChallenges);

function ActiveName() {
  const { active, challenges, loading } = useChallenges();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span>active: {active?.challenge.name ?? 'none'}</span>
      <span>count: {challenges.length}</span>
    </div>
  );
}

function renderProvider(route: string, { enabled = true } = {}): void {
  render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ChallengeProvider enabled={enabled}>
          <Routes>
            <Route path="*" element={<ActiveName />} />
          </Routes>
        </ChallengeProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ChallengeProvider', () => {
  beforeEach(() => {
    listMemberships.mockReset();
    listMemberships.mockResolvedValue({
      challenges: [
        makeSummary({ id: 'ch-1', name: 'Spring' }),
        makeSummary({ id: 'ch-2', name: 'Summer' }),
      ],
    });
  });

  it('resolves the active challenge from the URL', async () => {
    renderProvider('/c/ch-2/members');

    expect(await screen.findByText('active: Summer')).toBeInTheDocument();
  });

  it('resolves nothing for a challenge the caller is not in', async () => {
    renderProvider('/c/ch-9');

    expect(await screen.findByText('active: none')).toBeInTheDocument();
    expect(screen.getByText('count: 2')).toBeInTheDocument();
  });

  it('resolves nothing outside a challenge route', async () => {
    renderProvider('/challenges');

    expect(await screen.findByText('active: none')).toBeInTheDocument();
  });

  it('does not list memberships while signed out', () => {
    renderProvider('/', { enabled: false });

    expect(listMemberships).not.toHaveBeenCalled();
    expect(screen.getByText('active: none')).toBeInTheDocument();
  });
});
