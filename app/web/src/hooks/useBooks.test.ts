import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBooks } from './useBooks';

// Prevent real Firebase SDK initialization
vi.mock('../lib/firebase', () => ({ db: {} }));

// Stub firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-collection-ref'),
}));

// Mock the react-firebase-hooks collection listener
vi.mock('react-firebase-hooks/firestore', () => ({
  useCollection: vi.fn(),
}));

// Mock logger
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

describe('useBooks', () => {
  it('returns loading state while Firestore is loading', () => {
    mockUseCollection.mockReturnValue([undefined, true, undefined]);
    const { result } = renderHook(() => useBooks());
    expect(result.current.loading).toBe(true);
    expect(result.current.booksById.size).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('maps Firestore snapshot docs to booksById Map', () => {
    const snapshot = makeSnapshot([
      {
        title: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        titleLower: 'the left hand of darkness',
        authorLower: 'ursula k. le guin',
        createdBy: 'user-1',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    mockUseCollection.mockReturnValue([snapshot as never, false, undefined]);
    const { result } = renderHook(() => useBooks());
    expect(result.current.loading).toBe(false);
    expect(result.current.booksById.size).toBe(1);
    expect(result.current.booksById.get('doc-0')?.title).toBe('The Left Hand of Darkness');
    expect(result.current.booksById.get('doc-0')?.author).toBe('Ursula K. Le Guin');
  });

  it('returns error when Firestore listener errors', () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'permission-denied' as const });
    mockUseCollection.mockReturnValue([undefined, false, err]);
    const { result } = renderHook(() => useBooks());
    expect(result.current.error).toBe(err);
    expect(result.current.booksById.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });
});
