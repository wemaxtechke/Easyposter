import { apiFetch } from '../../lib/api';
import type { PosterProject } from '../types';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import { buildProjectContextForAi } from '../utils/posterAiContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PosterAiChatResponse {
  edits: Array<{ elementId: string; updates: Record<string, unknown> }>;
  message: string;
  usage: {
    totalTokens: number;
    tokensUsed: number;
    limit: number | null;
    remaining: number | null;
  };
}

export interface PosterAiUsageResponse {
  tokensUsed: number;
  limit: number | null;
  remaining: number | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function chatPosterAi(
  messages: ChatMessage[],
  project: PosterProject,
  fieldBindings?: PosterTemplateFieldBinding[] | null
): Promise<PosterAiChatResponse> {
  const projectContext = buildProjectContextForAi(project);
  const body: { messages: ChatMessage[]; project: unknown; fields?: PosterTemplateFieldBinding[] } = {
    messages,
    project: projectContext,
  };
  if (fieldBindings && fieldBindings.length > 0) {
    body.fields = fieldBindings;
  }
  const res = await apiFetch('/api/poster-ai/chat', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as PosterAiChatResponse & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data as PosterAiChatResponse;
}

export type PosterTemplateSummary = {
  id: string;
  name: string;
  category: string;
  description?: string;
};

export interface SuggestPosterFieldsResponse {
  templateId: string;
  [key: string]: string | number | null | undefined;
  usage?: {
    tokensUsed: number;
    limit: number | null;
    remaining: number | null;
  };
}

export async function suggestPosterFields(params: {
  category: string;
  userDescription: string;
  templateSummaries: PosterTemplateSummary[];
  fieldKeys: readonly string[];
}): Promise<Record<string, string> & { templateId: string }> {
  const body = {
    category: params.category,
    userDescription: params.userDescription.trim(),
    templates: params.templateSummaries,
    requiredKeys: [...params.fieldKeys],
  };
  const res = await apiFetch('/api/poster-ai/suggest-fields', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as SuggestPosterFieldsResponse & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  const { usage: _usage, ...rest } = data;
  return rest as Record<string, string> & { templateId: string };
}

/* ───────── Conversational Wizard API ───────── */

export interface WizardIdentifyResponse {
  message: string;
  category: string | null;
}

export async function wizardIdentify(params: {
  messages: ChatMessage[];
  categories: { value: string; label: string }[];
}): Promise<WizardIdentifyResponse> {
  const res = await apiFetch('/api/poster-ai/wizard-identify', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as WizardIdentifyResponse & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return { message: data.message, category: data.category ?? null };
}

export interface WizardGatherFieldsResponse {
  message: string;
  fields: Record<string, string>;
  complete: boolean;
}

export async function wizardGatherFields(params: {
  messages: ChatMessage[];
  templateName: string;
  fieldKeys: string[];
  fieldLabels: Record<string, string>;
}): Promise<WizardGatherFieldsResponse> {
  const res = await apiFetch('/api/poster-ai/wizard-gather-fields', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as WizardGatherFieldsResponse & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return { message: data.message, fields: data.fields ?? {}, complete: Boolean(data.complete) };
}

export async function getPosterAiUsage(): Promise<PosterAiUsageResponse> {
  const res = await apiFetch('/api/poster-ai/usage');
  const data = (await res.json().catch(() => ({}))) as PosterAiUsageResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as PosterAiUsageResponse;
}
