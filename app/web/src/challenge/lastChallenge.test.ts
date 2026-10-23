import { describe, it, expect, afterEach, vi } from 'vitest';
import { readLastChallengeId, writeLastChallengeId } from './lastChallenge';

describe('lastChallenge', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    writeLastChallengeId('ch-7');

    expect(readLastChallengeId()).toBe('ch-7');
  });

  it('reports no hint when nothing was written', () => {
    expect(readLastChallengeId()).toBeUndefined();
  });

  it('reports no hint when storage is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });

    expect(readLastChallengeId()).toBeUndefined();
  });

  it('swallows a failed write, leaving the caller to fall back', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });

    expect(() => writeLastChallengeId('ch-7')).not.toThrow();
  });
});
