import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { makeUserProfile } from '../testing/fixtures';
import { useUserProfile } from './useUserProfile';

vi.mock('../data/userProfile', () => ({
  getUserProfile: vi.fn(),
}));

import { getUserProfile } from '../data/userProfile';

const getUserProfileMock = vi.mocked(getUserProfile);

beforeEach(() => {
  getUserProfileMock.mockReset();
});

const render = (userId: string) =>
  renderHook(() => useUserProfile(userId), { wrapper: Providers });

describe('useUserProfile', () => {
  it('exposes the profile the call resolved', async () => {
    const profile = makeUserProfile({ id: 'user-2', name: 'Ada' });
    getUserProfileMock.mockResolvedValue(profile);

    const { result } = render('user-2');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual(profile);
    expect(getUserProfileMock).toHaveBeenCalledWith({ userId: 'user-2' });
  });

  // A user id with no document is normal — the leaderboard links to any id that
  // appears in the readings, including one whose profile was never written.
  it('reports no profile without an error when the user has none', async () => {
    getUserProfileMock.mockResolvedValue(null);

    const { result } = render('user-2');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('does not call the function for an empty user id', () => {
    const { result } = render('');

    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toBeUndefined();
  });

  it('exposes a failed call as an error', async () => {
    getUserProfileMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render('user-2');

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.profile).toBeUndefined();
  });
});
