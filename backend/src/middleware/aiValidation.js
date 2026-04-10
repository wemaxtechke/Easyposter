const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 50000;
const MAX_PROMPT_CHARS = 2000;
const ALLOWED_ROLES = new Set(['user', 'assistant']);

/**
 * Sanitize and cap an array of chat messages.
 * Returns a trimmed, safe copy or null if input is not an array.
 */
export function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const msgs = raw.slice(-MAX_MESSAGES);
  const result = [];
  let totalChars = 0;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    const role = ALLOWED_ROLES.has(m.role) ? m.role : 'user';
    const content =
      typeof m.content === 'string'
        ? m.content.slice(0, MAX_MESSAGE_CHARS)
        : '';
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) break;
    result.push({ role, content });
  }
  return result;
}

/**
 * Cap a single prompt/adjustment string.
 */
export function sanitizePrompt(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_PROMPT_CHARS);
}
