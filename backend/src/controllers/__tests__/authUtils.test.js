import { describe, it, expect } from 'vitest';
import { isStrongPassword } from '../authController.js';

describe('isStrongPassword', () => {
  it('accepts a valid strong password', () => {
    expect(isStrongPassword('Abcdef1x')).toBe(true);
    expect(isStrongPassword('P@ssw0rd')).toBe(true);
    expect(isStrongPassword('MySecure99')).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(isStrongPassword('Ab1cdef')).toBe(false);
    expect(isStrongPassword('Aa1')).toBe(false);
  });

  it('rejects passwords without uppercase', () => {
    expect(isStrongPassword('abcdef1x')).toBe(false);
  });

  it('rejects passwords without lowercase', () => {
    expect(isStrongPassword('ABCDEF1X')).toBe(false);
  });

  it('rejects passwords without a digit', () => {
    expect(isStrongPassword('Abcdefgh')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isStrongPassword(null)).toBe(false);
    expect(isStrongPassword(undefined)).toBe(false);
    expect(isStrongPassword(12345678)).toBe(false);
    expect(isStrongPassword({})).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isStrongPassword('')).toBe(false);
  });
});
