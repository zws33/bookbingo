import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInChallenge } from '../testing/challenge-utils';
import { makeSummary } from '../testing/challengeFixtures';
import { makeReading } from '../testing/fixtures';
import type { ChallengeStatus } from '../types/challenges';
import { MyBooksPage } from './MyBooksPage';

vi.mock('../data/readings', () => ({
  listReadings: vi.fn(),
  createReading: vi.fn(),
  updateReading: vi.fn(),
  deleteReading: vi.fn(),
}));
vi.mock('../data/boardConfig', () => ({ getBoardConfig: vi.fn() }));
// Both reach `lib/firebase`, which throws without a Firebase config. CI's
// verify job supplies none, so an unmocked path here fails there and not here.
vi.mock('../lib/bookSearch', () => ({
  searchBooks: vi.fn(),
  resolveBook: vi.fn(),
}));
vi.mock('../lib/createManualBook', () => ({ createManualBook: vi.fn() }));

import { listReadings } from '../data/readings';
import { getBoardConfig } from '../data/boardConfig';

const listReadingsMock = vi.mocked(listReadings);
const getBoardConfigMock = vi.mocked(getBoardConfig);

beforeEach(() => {
  listReadingsMock.mockReset();
  listReadingsMock.mockResolvedValue({
    readings: [makeReading()],
    score: {
      score: 1,
      varietyPoints: 1,
      volumePoints: 1,
      tileCounts: {},
      totalBooks: 1,
    },
  });
  getBoardConfigMock.mockReset();
  getBoardConfigMock.mockResolvedValue({ tiles: [], maxTilesPerBook: 3 });
});

function renderAt(status: ChallengeStatus) {
  const summary = makeSummary({ id: 'ch-1', status });
  return renderInChallenge(<MyBooksPage userId="user-1" />, {
    route: '/c/ch-1',
    path: '/c/:challengeId',
    challenges: [summary],
    active: summary,
  });
}

const addButton = () => screen.queryByRole('button', { name: 'Add book' });

describe('MyBooksPage write affordances', () => {
  it('offers the add button in an active challenge', async () => {
    renderAt('active');

    expect(
      await screen.findByRole('button', { name: 'Add book' }),
    ).toBeVisible();
  });

  for (const status of ['draft', 'complete'] as const) {
    it(`hides the add button in a ${status} challenge`, async () => {
      renderAt(status);

      await screen.findByText(/Le Guin/);
      expect(addButton()).toBeNull();
    });
  }
});
