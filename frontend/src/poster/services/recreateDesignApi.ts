import { apiFetch } from '../../lib/api';
import type { PosterProject } from '../types';

export interface RecreateDesignResponse {
  project: PosterProject;
  usage: {
    totalTokens: number;
    tokensUsed: number;
    limit: number | null;
    remaining: number | null;
  };
}

export async function recreateDesignFromImage(
  file: File,
  onStatus?: (msg: string) => void
): Promise<RecreateDesignResponse> {
  onStatus?.('Uploading image…');

  const form = new FormData();
  form.append('image', file);

  onStatus?.('AI is analyzing the design…');

  const res = await apiFetch('/api/recreate-design', {
    method: 'POST',
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as RecreateDesignResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  if (!data.project?.elements) {
    throw new Error('AI returned an invalid project structure.');
  }

  onStatus?.('Design recreated successfully!');
  return data;
}
