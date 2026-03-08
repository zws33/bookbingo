import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReadings } from './useReadings';

// Prevent real Firebase SDK initialization
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore so collection() doesn't validate the db argument
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-collection-ref'),
}));

// Mock the react-firebase-hooks collection listener
vi.mock('react-firebase-hooks/firestore', () => ({
  useCollection: vi.fn(),
}));

// Mock logger to prevent initialization errors in test environment
vi.mock('@bookbingo/lib-util', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

import { useCollection } from 'react-firebase-hooks/firestore';

const mockUseCollection = vi.mocked(useCollection);

// Helper: build a minimal QuerySnapshot-like object from plain data objects
function makeSnapshot(docs: Record<string, unknown>[]) {
  return {
    docs: docs.map((data, i) => ({
      id: `doc-${i}`,
      data: () => data,
    })),
  };
}

beforeEach(() => {
  mockUseCollection.mockReset();
});

describe('useReadings', () => {
  it('returns loading state while Firestore is loading', () => {
    mockUseCollection.mockReturnValue([undefined, true, undefined]);
    const { result } = renderHook(() => useReadings('user-1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.readings).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('maps Firestore snapshot docs to Reading[]', () => {
    const snapshot = makeSnapshot([
      {
        bookTitle: 'The Left Hand of Darkness',
        bookAuthor: 'Ursula K. Le Guin',
        tiles: ['sci-fi'],
        isFreebie: false,
        readAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      },
    ]);
    mockUseCollection.mockReturnValue([snapshot as never, false, undefined]);
    const { result } = renderHook(() => useReadings('user-1'));
    expect(result.current.loading).toBe(false);
    expect(result.current.readings).toHaveLength(1);
    expect(result.current.readings[0].bookTitle).toBe('The Left Hand of Darkness');
    expect(result.current.readings[0].id).toBe('doc-0');
  });

  it('returns error when Firestore listener errors', () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'permission-denied' as const });
    mockUseCollection.mockReturnValue([undefined, false, err]);
    const { result } = renderHook(() => useReadings('user-1'));
    expect(result.current.error).toBe(err);
    expect(result.current.readings).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns empty array and skips query when userId is empty', () => {
    mockUseCollection.mockReturnValue([undefined, false, undefined]);
    const { result } = renderHook(() => useReadings(''));
    // useCollection is called with undefined query when userId is empty
    expect(mockUseCollection).toHaveBeenCalledWith(undefined);
    expect(result.current.readings).toEqual([]);
  });
});
