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
vi.mock('../data/score', () => ({ getScore: vi.fn() }));
// Both reach `lib/firebase`, which throws without a Firebase config. CI's
// verify job supplies none, so an unmocked path here fails there and not here.
vi.mock('../lib/bookSearch', () => ({
  searchBooks: vi.fn(),
  resolveBook: vi.fn(),
}));
vi.mock('../lib/createManualBook', () => ({ createManualBook: vi.fn() }));

import { listReadings } from '../data/readings';
import { getBoardConfig } from '../data/boardConfig';
import { getScore } from '../data/score';

const listReadingsMock = vi.mocked(listReadings);
const getBoardConfigMock = vi.mocked(getBoardConfig);
const getScoreMock = vi.mocked(getScore);

beforeEach(() => {
  listReadingsMock.mockReset();
  listReadingsMock.mockResolvedValue({ readings: [makeReading()] });
  getBoardConfigMock.mockReset();
  getBoardConfigMock.mockResolvedValue({ tiles: [], maxTilesPerBook: 3 });
  getScoreMock.mockReset();
  getScoreMock.mockResolvedValue({
    score: 1,
    varietyPoints: 1,
    volumePoints: 0,
    tileCounts: {},
    totalBooks: 1,
  });
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

describe('MyBooksPage score card', () => {
  // The card sits above a list that loads separately, so a failed score must
  // not take the books down with it.
  it('still renders the book list when the score call fails', async () => {
    getScoreMock.mockRejectedValue(new Error('functions/unavailable'));

    renderAt('active');

    expect(await screen.findByText(/Le Guin/)).toBeVisible();
    expect(screen.queryByText('Bingo Score')).toBeNull();
  });

  it('hides the card until the score arrives', async () => {
    getScoreMock.mockReturnValue(new Promise(() => {}));

    renderAt('active');

    expect(await screen.findByText(/Le Guin/)).toBeVisible();
    expect(screen.queryByText('Bingo Score')).toBeNull();
  });

  it('renders the card once the score arrives', async () => {
    renderAt('active');

    expect(await screen.findByText('Bingo Score')).toBeVisible();
  });
});

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
