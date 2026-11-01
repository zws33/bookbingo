import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { makeReading } from '../testing/fixtures';
import { useReadings } from './useReadings';

vi.mock('../data/readings', () => ({
  listReadings: vi.fn(),
}));

import { listReadings } from '../data/readings';

const listReadingsMock = vi.mocked(listReadings);

beforeEach(() => {
  listReadingsMock.mockReset();
});

const CHALLENGE_ID = 'challenge-1';

const render = (userId: string) =>
  renderHook(() => useReadings(CHALLENGE_ID, userId), { wrapper: Providers });

describe('useReadings', () => {
  it('exposes the readings the server returned', async () => {
    const readings = [makeReading()];
    listReadingsMock.mockResolvedValue({ readings });

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.readings).toEqual(readings);
    expect(listReadingsMock).toHaveBeenCalledWith({
      challengeId: CHALLENGE_ID,
      userId: 'user-1',
    });
  });

  it('does not call the function for an empty user id', () => {
    const { result } = render('');

    expect(listReadingsMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.readings).toEqual([]);
  });

  it('reports an empty list before the first response', () => {
    listReadingsMock.mockReturnValue(new Promise(() => {}));

    const { result } = render('user-1');

    expect(result.current.loading).toBe(true);
    expect(result.current.readings).toEqual([]);
  });

  it('exposes a failed call as an error', async () => {
    listReadingsMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.readings).toEqual([]);
  });

  it('caches by user id, so two views of one user make one call', async () => {
    listReadingsMock.mockResolvedValue({ readings: [] });

    const { result } = renderHook(
      () => ({
        a: useReadings(CHALLENGE_ID, 'user-1'),
        b: useReadings(CHALLENGE_ID, 'user-1'),
      }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(listReadingsMock).toHaveBeenCalledTimes(1);
  });
});
