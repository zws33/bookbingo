import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Providers } from '../testing/test-utils';
import { makeTBREntry } from '../testing/fixtures';
import { useTBR } from './useTBR';

vi.mock('../data/tbr', () => ({
  listMyTBR: vi.fn(),
}));

import { listMyTBR } from '../data/tbr';

const listMyTBRMock = vi.mocked(listMyTBR);

beforeEach(() => {
  listMyTBRMock.mockReset();
});

const render = (userId: string) =>
  renderHook(() => useTBR(userId), { wrapper: Providers });

describe('useTBR', () => {
  it('exposes the entries the call resolved', async () => {
    const entries = [makeTBREntry(), makeTBREntry({ id: 'tbr-2' })];
    listMyTBRMock.mockResolvedValue(entries);

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual(entries);
  });

  // The list is always the caller's own; the id only gates the request.
  it('sends no arguments to the callable', async () => {
    listMyTBRMock.mockResolvedValue([]);

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listMyTBRMock).toHaveBeenCalledWith();
  });

  it('does not call the function for an empty user id', () => {
    const { result } = render('');

    expect(listMyTBRMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([]);
  });

  it('exposes a failed call as an error', async () => {
    listMyTBRMock.mockRejectedValue(new Error('functions/unavailable'));

    const { result } = render('user-1');

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.entries).toEqual([]);
  });
});
