import { apiFetch } from '../../lib/api';
import { apiUrl } from '../../lib/apiUrl';

export interface UserPosterImage {
  id: string;
  url: string;
  originalName: string;
  createdAt?: string;
}

export async function listUserPosterImages(): Promise<UserPosterImage[]> {
  const res = await apiFetch('/api/user-poster-images');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to load images (${res.status})`);
  }
  const data = (await res.json()) as UserPosterImage[];
  return Array.isArray(data) ? data : [];
}

export async function uploadUserPosterImage(file: File): Promise<UserPosterImage> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await apiFetch('/api/user-poster-images', {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as UserPosterImage & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data as UserPosterImage;
}

export async function deleteUserPosterImage(id: string): Promise<void> {
  const res = await apiFetch(`/api/user-poster-images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
}
