import { apiFetch } from '../lib/api';
import type { EditorState } from '../core/types';

export interface ThreeTextAiUsageResponse {
  tokensUsed: number;
  limit: number | null;
  remaining: number | null;
}

export interface ThreeTextAiGenerateResponse {
  preset: Partial<EditorState>;
  usage: {
    totalTokens: number;
    tokensUsed: number;
    limit: number | null;
    remaining: number | null;
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function getErrorMessage(res: Response, data: { error?: string; message?: string }): string {
  if (res.status === 401) return 'Sign in to use AI';
  if (res.status === 402) return data.message || data.error || 'Token limit reached. Upgrade to Pro for more.';
  if (res.status === 503) return data.error || 'AI service not configured';
  return data.message || data.error || `Request failed (${res.status})`;
}

export async function generateStyleFromPrompt(prompt: string): Promise<Partial<EditorState> | null> {
  const res = await apiFetch('/api/3d-text-ai/generate', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json().catch(() => ({}))) as ThreeTextAiGenerateResponse & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(getErrorMessage(res, data));
  }
  return data.preset ?? null;
}

export async function adjustStyleFromPrompt(
  adjustment: string,
  currentState: Partial<EditorState>
): Promise<Partial<EditorState> | null> {
  const res = await apiFetch('/api/3d-text-ai/adjust', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ adjustment, currentState }),
  });
  const data = (await res.json().catch(() => ({}))) as ThreeTextAiGenerateResponse & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(getErrorMessage(res, data));
  }
  return data.preset ?? null;
}

export async function getAiUsage(): Promise<ThreeTextAiUsageResponse | null> {
  const res = await apiFetch('/api/ai/usage');
  if (res.status === 401) return null;
  const data = (await res.json().catch(() => ({}))) as ThreeTextAiUsageResponse & { error?: string };
  if (!res.ok) {
    return null;
  }
  return data as ThreeTextAiUsageResponse;
}
