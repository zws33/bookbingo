import { describe, it, expect } from 'vitest';
import { formatJoinCode, normalizeJoinCode } from './joinCode';

describe('join codes', () => {
  it('groups a code in fours for reading aloud', () => {
    expect(formatJoinCode('BNG02026')).toBe('BNG0 2026');
  });

  it('round-trips the grouping it adds', () => {
    expect(normalizeJoinCode(formatJoinCode('WXYZ3456'))).toBe('WXYZ3456');
  });
});
