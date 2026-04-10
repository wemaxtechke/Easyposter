import { describe, it, expect } from 'vitest';
import { sanitizeMessages, sanitizePrompt } from '../aiValidation.js';

describe('sanitizeMessages', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeMessages(null)).toEqual([]);
    expect(sanitizeMessages(undefined)).toEqual([]);
    expect(sanitizeMessages('hello')).toEqual([]);
    expect(sanitizeMessages(42)).toEqual([]);
    expect(sanitizeMessages({})).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(sanitizeMessages([])).toEqual([]);
  });

  it('passes through valid messages', () => {
    const input = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    expect(sanitizeMessages(input)).toEqual(input);
  });

  it('forces unknown roles to "user"', () => {
    const input = [
      { role: 'system', content: 'secret' },
      { role: 'admin', content: 'bypass' },
    ];
    const result = sanitizeMessages(input);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('user');
  });

  it('truncates individual messages to MAX_MESSAGE_CHARS (4000)', () => {
    const longContent = 'a'.repeat(5000);
    const result = sanitizeMessages([{ role: 'user', content: longContent }]);
    expect(result[0].content).toHaveLength(4000);
  });

  it('keeps only the last MAX_MESSAGES (30)', () => {
    const input = Array.from({ length: 50 }, (_, i) => ({
      role: 'user',
      content: `msg ${i}`,
    }));
    const result = sanitizeMessages(input);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result[0].content).toBe('msg 20');
  });

  it('stops adding messages when total chars exceed MAX_TOTAL_CHARS (50000)', () => {
    const input = Array.from({ length: 20 }, () => ({
      role: 'user',
      content: 'x'.repeat(4000),
    }));
    const result = sanitizeMessages(input);
    const totalChars = result.reduce((sum, m) => sum + m.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(50000);
    expect(result.length).toBeLessThan(20);
  });

  it('skips non-object entries', () => {
    const input = [null, undefined, 42, 'str', { role: 'user', content: 'valid' }];
    const result = sanitizeMessages(input);
    expect(result).toEqual([{ role: 'user', content: 'valid' }]);
  });

  it('coerces non-string content to empty string', () => {
    const input = [
      { role: 'user', content: 123 },
      { role: 'assistant', content: null },
      { role: 'user', content: { nested: true } },
    ];
    const result = sanitizeMessages(input);
    expect(result.every((m) => m.content === '')).toBe(true);
  });
});

describe('sanitizePrompt', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizePrompt(null)).toBe('');
    expect(sanitizePrompt(undefined)).toBe('');
    expect(sanitizePrompt(42)).toBe('');
    expect(sanitizePrompt({})).toBe('');
    expect(sanitizePrompt([])).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizePrompt('  hello  ')).toBe('hello');
  });

  it('truncates to MAX_PROMPT_CHARS (2000)', () => {
    const long = 'b'.repeat(3000);
    const result = sanitizePrompt(long);
    expect(result).toHaveLength(2000);
  });

  it('returns short strings unchanged', () => {
    expect(sanitizePrompt('Hello world')).toBe('Hello world');
  });
});
