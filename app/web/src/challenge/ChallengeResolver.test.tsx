import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useParams } from 'react-router-dom';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { ChallengeResolver } from './ChallengeResolver';
import { writeLastChallengeId } from './lastChallenge';

function OpenedChallenge() {
  return <div>opened {useParams().challengeId}</div>;
}

const routes = (
  <Routes>
    <Route path="/" element={<ChallengeResolver />} />
    <Route path="/challenges" element={<div>your challenges</div>} />
    <Route path="/c/:challengeId" element={<OpenedChallenge />} />
  </Routes>
);

describe('ChallengeResolver', () => {
  afterEach(() => window.localStorage.clear());

  it('sends a member with no challenges to the chooser', async () => {
    renderInChallenge(routes);

    expect(await screen.findByText('your challenges')).toBeInTheDocument();
  });

  it('opens the only challenge without asking', async () => {
    renderInChallenge(routes, { challenges: [makeSummary({ id: 'ch-1' })] });

    expect(await screen.findByText('opened ch-1')).toBeInTheDocument();
  });

  it('opens the remembered challenge when there are several', async () => {
    writeLastChallengeId('ch-2');

    renderInChallenge(routes, {
      challenges: [makeSummary({ id: 'ch-1' }), makeSummary({ id: 'ch-2' })],
    });

    expect(await screen.findByText('opened ch-2')).toBeInTheDocument();
  });

  it('falls back to the chooser when the remembered challenge is gone', async () => {
    writeLastChallengeId('ch-9');

    renderInChallenge(routes, {
      challenges: [makeSummary({ id: 'ch-1' }), makeSummary({ id: 'ch-2' })],
    });

    expect(await screen.findByText('your challenges')).toBeInTheDocument();
  });

  it('asks which of several challenges to open', async () => {
    renderInChallenge(routes, {
      challenges: [makeSummary({ id: 'ch-1' }), makeSummary({ id: 'ch-2' })],
    });

    expect(await screen.findByText('your challenges')).toBeInTheDocument();
  });

  it('decides nothing while the memberships are loading', () => {
    renderInChallenge(routes, { loading: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('your challenges')).not.toBeInTheDocument();
  });
});
