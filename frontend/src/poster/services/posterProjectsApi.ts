import type { PosterProject } from '../types';
import { apiFetch } from '../../lib/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type SavedPosterProjectItem = {
  id: string;
  name: string;
  thumbnail?: string;
  createdAt?: string;
  updatedAt?: string;
  project: PosterProject;
};

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

/** List the current user's saved poster snapshots ("My stuff") from the cloud. */
export async function listMyPosterProjects(): Promise<SavedPosterProjectItem[]> {
  const res = await apiFetch('/api/my-poster-projects');
  if (!res.ok) {
    if (res.status === 401) return [];
    throw new Error(`Failed to load saved posters (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as { items?: SavedPosterProjectItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** Save a snapshot to the user's private cloud "My stuff". */
export async function savePosterProjectToMyCloud(
  params: { name: string; project: PosterProject; thumbnail?: string }
): Promise<SavedPosterProjectItem> {
  const res = await apiFetch('/api/my-poster-projects', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; item?: SavedPosterProjectItem };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  if (!data.item) throw new Error('Invalid response from server');
  return data.item;
}

export async function deleteMyPosterProject(id: string): Promise<void> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Delete failed (${res.status})`);
}

export async function renameMyPosterProject(id: string, name: string): Promise<void> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Rename failed (${res.status})`);
}

export async function updateMyPosterProject(params: {
  id: string;
  name?: string;
  project?: PosterProject;
  thumbnail?: string;
}): Promise<SavedPosterProjectItem> {
  const res = await apiFetch(`/api/my-poster-projects/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.project !== undefined ? { project: params.project } : {}),
      ...(params.thumbnail !== undefined ? { thumbnail: params.thumbnail } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; item?: SavedPosterProjectItem };
  if (!res.ok) throw new Error(data.error || `Update failed (${res.status})`);
  if (!data.item) throw new Error('Invalid response from server');
  return data.item;
}
