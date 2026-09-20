import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { makeUserProfile } from '../testing/fixtures';
import { useUsers } from './useUsers';

// The hook depends only on the data seam; Firebase never enters the test.
vi.mock('../data/users', () => ({
  listUsers: vi.fn(),
}));

import { listUsers } from '../data/users';

const listUsersMock = vi.mocked(listUsers);

beforeEach(() => {
  listUsersMock.mockReset();
});

const render = () => renderHook(() => useUsers(), { wrapper: Providers });

describe('useUsers', () => {
  it('starts in loading state with an empty list', () => {
    listUsersMock.mockReturnValue(new Promise(() => {}));

    const { result } = render();

    expect(result.current.loading).toBe(true);
    expect(result.current.users).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the users the call resolved', async () => {
    const users = [makeUserProfile(), makeUserProfile({ id: 'user-2' })];
    listUsersMock.mockResolvedValue(users);

    const { result } = render();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual(users);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes a failed call as an error and keeps the list empty', async () => {
    listUsersMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render();

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('functions/unavailable');
    expect(result.current.users).toEqual([]);
  });

  it('calls the function once for two hooks sharing the cache', async () => {
    listUsersMock.mockResolvedValue([]);

    const { result } = renderHook(
      () => ({ first: useUsers(), second: useUsers() }),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.first.loading).toBe(false));
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });
});
