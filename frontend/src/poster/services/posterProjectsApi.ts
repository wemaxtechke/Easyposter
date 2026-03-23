import type { PosterProject } from '../types';
import { apiFetch } from '../../lib/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Load the current user's auto-saved poster project from the cloud. */
export async function loadPosterProjectFromCloud(): Promise<PosterProject | null> {
  const res = await apiFetch('/api/poster-projects');
  if (!res.ok) {
    if (res.status === 401) return null;
    throw new Error(`Failed to load project (${res.status})`);
  }
  const data = (await res.json()) as { project: PosterProject | null };
  return data.project ?? null;
}

/** Save the current user's poster project to the cloud. Returns the processed project (with Cloudinary URLs). */
export async function savePosterProjectToCloud(project: PosterProject): Promise<PosterProject> {
  const res = await apiFetch('/api/poster-projects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ project }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; project?: PosterProject };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  if (!data.project) throw new Error('Invalid response from server');
  return data.project;
}
