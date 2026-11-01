import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { useScore } from './useScore';
import type { Score } from '../types/schemas';

vi.mock('../data/score', () => ({
  getScore: vi.fn(),
}));

import { getScore } from '../data/score';

const getScoreMock = vi.mocked(getScore);

const SCORE: Score = {
  score: 4.5,
  varietyPoints: 3,
  volumePoints: 1.5,
  tileCounts: { t02: 2 },
  totalBooks: 2,
};

beforeEach(() => {
  getScoreMock.mockReset();
});

const CHALLENGE_ID = 'challenge-1';

const render = (challengeId: string, userId: string) =>
  renderHook(() => useScore(challengeId, userId), { wrapper: Providers });

describe('useScore', () => {
  it('exposes the breakdown the server computed', async () => {
    getScoreMock.mockResolvedValue(SCORE);

    const { result } = render(CHALLENGE_ID, 'user-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.score).toEqual(SCORE);
    expect(getScoreMock).toHaveBeenCalledWith({
      challengeId: CHALLENGE_ID,
      userId: 'user-1',
    });
  });

  it('does not call the function for an empty user id', () => {
    const { result } = render(CHALLENGE_ID, '');

    expect(getScoreMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('does not call the function for an empty challenge id', () => {
    const { result } = render('', 'user-1');

    expect(getScoreMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  // Callers render score unconditionally, so it is a zero score while loading
  // rather than undefined.
  it('reports a zero score before the first response', () => {
    getScoreMock.mockReturnValue(new Promise(() => {}));

    const { result } = render(CHALLENGE_ID, 'user-1');

    expect(result.current.loading).toBe(true);
    expect(result.current.score).toEqual({
      score: 0,
      varietyPoints: 0,
      volumePoints: 0,
      tileCounts: {},
      totalBooks: 0,
    });
  });

  it('exposes a failed call as an error and keeps the zero score', async () => {
    getScoreMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render(CHALLENGE_ID, 'user-1');

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.score.score).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('caches by user id, so two views of one user make one call', async () => {
    getScoreMock.mockResolvedValue(SCORE);

    const { result } = renderHook(
      () => ({
        a: useScore(CHALLENGE_ID, 'user-1'),
        b: useScore(CHALLENGE_ID, 'user-1'),
      }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(getScoreMock).toHaveBeenCalledTimes(1);
  });

  // The key names its challenge, so switching challenges cannot serve the
  // previous one's score for the same member.
  it('scopes the cache to the challenge', async () => {
    getScoreMock.mockResolvedValue(SCORE);

    const { result } = renderHook(
      () => ({
        a: useScore(CHALLENGE_ID, 'user-1'),
        b: useScore('challenge-2', 'user-1'),
      }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.b.loading).toBe(false));
    expect(getScoreMock).toHaveBeenCalledTimes(2);
  });
});
