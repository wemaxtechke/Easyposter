import { apiFetch } from '../../lib/api';
import type { PosterProject } from '../types';

export interface FromReferenceDesignResponse {
  project: PosterProject;
  usage: {
    totalTokens: number;
    tokensUsed: number;
    limit: number | null;
    remaining: number | null;
  };
  reviewPasses?: number;
}

export async function createPosterFromReferenceImage(
  file: File,
  onStatus?: (msg: string) => void,
  reviewPasses = 0
): Promise<FromReferenceDesignResponse> {
  onStatus?.('Uploading reference image…');

  const form = new FormData();
  form.append('image', file);
  form.append('reviewPasses', String(reviewPasses));

  onStatus?.('AI is reconstructing the poster…');

  const res = await apiFetch('/api/poster-ai/from-reference', {
    method: 'POST',
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as FromReferenceDesignResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  if (!data.project?.elements) {
    throw new Error('AI returned an invalid project structure.');
  }

  onStatus?.('Reference poster recreated successfully!');
  return data;
}