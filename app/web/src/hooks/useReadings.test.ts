import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { makeReading } from '../testing/fixtures';
import { useReadings } from './useReadings';
import type { Score } from '../types/schemas';

vi.mock('../data/readings', () => ({
  listReadings: vi.fn(),
}));

import { listReadings } from '../data/readings';

const listReadingsMock = vi.mocked(listReadings);

const SCORE: Score = {
  score: 4.5,
  varietyPoints: 3,
  volumePoints: 2,
  balanceFactor: 0.75,
  tileCounts: { t02: 2 },
  totalBooks: 2,
};

beforeEach(() => {
  listReadingsMock.mockReset();
});

const render = (userId: string) =>
  renderHook(() => useReadings(userId), { wrapper: Providers });

describe('useReadings', () => {
  it('exposes the readings and the score the server computed', async () => {
    const readings = [makeReading()];
    listReadingsMock.mockResolvedValue({ readings, score: SCORE });

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.readings).toEqual(readings);
    expect(result.current.score).toEqual(SCORE);
    expect(listReadingsMock).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('does not call the function for an empty user id', () => {
    const { result } = render('');

    expect(listReadingsMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.readings).toEqual([]);
  });

  // Callers render score unconditionally, so it is a zero score while loading
  // rather than undefined.
  it('reports a zero score before the first response', () => {
    listReadingsMock.mockReturnValue(new Promise(() => {}));

    const { result } = render('user-1');

    expect(result.current.loading).toBe(true);
    expect(result.current.score.score).toBe(0);
    expect(result.current.score.totalBooks).toBe(0);
  });

  it('exposes a failed call as an error', async () => {
    listReadingsMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.readings).toEqual([]);
  });

  it('caches by user id, so two views of one user make one call', async () => {
    listReadingsMock.mockResolvedValue({ readings: [], score: SCORE });

    const { result } = renderHook(
      () => ({ a: useReadings('user-1'), b: useReadings('user-1') }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(listReadingsMock).toHaveBeenCalledTimes(1);
  });
});
