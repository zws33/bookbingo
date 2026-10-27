import { describe, it, expect } from 'vitest';
import {
  atLeast,
  canChangeStatus,
  canEditConfig,
  canManageMembers,
  canRename,
  nextStatus,
  outranks,
  statusAllows,
} from './permissions';

describe('rank comparison', () => {
  it('holds a permission at or above its minimum role', () => {
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('admin', 'admin')).toBe(true);
    expect(atLeast('member', 'admin')).toBe(false);
  });

  it('does not let a role outrank itself', () => {
    expect(outranks('owner', 'owner')).toBe(false);
    expect(outranks('owner', 'admin')).toBe(true);
  });
});

describe('lifecycle gates', () => {
  it('opens readings only while the challenge is active', () => {
    expect(statusAllows('draft', 'readingWrite')).toBe(false);
    expect(statusAllows('active', 'readingWrite')).toBe(true);
    expect(statusAllows('complete', 'readingWrite')).toBe(false);
  });

  it('keeps deletion available at every status', () => {
    expect(statusAllows('draft', 'delete')).toBe(true);
    expect(statusAllows('active', 'delete')).toBe(true);
    expect(statusAllows('complete', 'delete')).toBe(true);
  });
});

describe('composed UI gates', () => {
  it('locks the tag cap once the challenge starts, for an admin too', () => {
    expect(canEditConfig('admin', 'draft')).toBe(true);
    expect(canEditConfig('admin', 'active')).toBe(false);
    expect(canEditConfig('owner', 'active')).toBe(false);
  });

  it('keeps renaming open while the cap is locked', () => {
    expect(canRename('admin', 'active')).toBe(true);
    expect(canRename('admin', 'complete')).toBe(false);
  });

  it('denies a member both regardless of status', () => {
    expect(canEditConfig('member', 'draft')).toBe(false);
    expect(canRename('member', 'active')).toBe(false);
    expect(canManageMembers('member', 'active')).toBe(false);
  });

  it('reserves status changes for the owner', () => {
    expect(canChangeStatus('owner')).toBe(true);
    expect(canChangeStatus('admin')).toBe(false);
  });

  it('walks the lifecycle one step forward and stops', () => {
    expect(nextStatus('draft')).toBe('active');
    expect(nextStatus('active')).toBe('complete');
    expect(nextStatus('complete')).toBeUndefined();
  });
});
