import { describe, it, expect } from 'vitest';
import { diffRemovedIds } from '../cloudinaryCleanup.js';

describe('diffRemovedIds', () => {
  it('returns empty array when oldIds is empty', () => {
    expect(diffRemovedIds([], ['a', 'b'])).toEqual([]);
  });

  it('returns empty array when oldIds is not an array', () => {
    expect(diffRemovedIds(null, ['a'])).toEqual([]);
    expect(diffRemovedIds(undefined, ['a'])).toEqual([]);
  });

  it('returns all old IDs when newIds is empty', () => {
    expect(diffRemovedIds(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('returns all old IDs when newIds is null/undefined', () => {
    expect(diffRemovedIds(['a', 'b'], null)).toEqual(['a', 'b']);
    expect(diffRemovedIds(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });

  it('returns removed IDs', () => {
    expect(diffRemovedIds(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['a']);
  });

  it('returns empty array when nothing was removed', () => {
    expect(diffRemovedIds(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('handles duplicate old IDs correctly', () => {
    expect(diffRemovedIds(['a', 'a', 'b'], ['b'])).toEqual(['a', 'a']);
  });
});
