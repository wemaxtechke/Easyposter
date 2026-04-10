import { describe, it, expect } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from '../RefreshToken.js';

describe('generateRefreshToken', () => {
  it('returns a hex string of 80 characters (40 bytes)', () => {
    const token = generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(80);
    expect(/^[0-9a-f]{80}$/.test(token)).toBe(true);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(50);
  });
});

describe('hashRefreshToken', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashRefreshToken('test-token');
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('is deterministic — same input, same hash', () => {
    const a = hashRefreshToken('my-secret-token');
    const b = hashRefreshToken('my-secret-token');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = hashRefreshToken('token-1');
    const b = hashRefreshToken('token-2');
    expect(a).not.toBe(b);
  });
});
