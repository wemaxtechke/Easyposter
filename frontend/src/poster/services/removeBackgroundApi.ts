import { apiUrl } from '../../lib/apiUrl';
import type { PosterImageElement, Poster3DTextElement } from '../types';

/**
 * Remove background from an image via the backend (remove.bg API).
 * Returns a data URL of the processed PNG with transparency.
 */
export async function removeBackground(input: File | Blob | string): Promise<string> {
  let blob: Blob;
  if (typeof input === 'string') {
    if (input.startsWith('data:') || input.startsWith('http')) {
      const res = await fetch(input);
      blob = await res.blob();
    } else {
      throw new Error('Invalid image input: expected File, Blob, or data/HTTP URL');
    }
  } else {
    blob = input;
  }

  const fd = new FormData();
  fd.append('image', blob, 'image.png');

  const res = await fetch(apiUrl('/api/remove-bg'), {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Background removal failed' }));
    throw new Error((errData as { error?: string }).error || `Server error ${res.status}`);
  }

  const resultBlob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(resultBlob);
  });
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('Failed to load image'));
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

/**
 * New upload: remove background and return src + scale so on-canvas size matches the original file at scale 1.
 */
export async function removeBackgroundFromFilePreservingDisplay(
  file: File
): Promise<{ src: string; scaleX: number; scaleY: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const oldDims = await getImageDimensions(objectUrl);
    const src = await removeBackground(file);
    const newDims = await getImageDimensions(src);
    const scaleX = newDims.width > 0 ? oldDims.width / newDims.width : 1;
    const scaleY = newDims.height > 0 ? oldDims.height / newDims.height : 1;
    return { src, scaleX, scaleY };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type RemoveBgRasterElement =
  | Pick<PosterImageElement, 'src' | 'scaleX' | 'scaleY'>
  | Pick<Poster3DTextElement, 'image' | 'scaleX' | 'scaleY'>;

/**
 * Existing canvas raster (image or 3D text bitmap): replace with background-removed version; keep same displayed size and position (left/top unchanged).
 */
export async function removeBackgroundFromElementPreservingLayout(
  el: RemoveBgRasterElement
): Promise<{ primary: string; scaleX: number; scaleY: number }> {
  const source = 'src' in el ? el.src : el.image;
  const newSrc = await removeBackground(source);
  try {
    const [oldDims, newDims] = await Promise.all([
      getImageDimensions(source),
      getImageDimensions(newSrc),
    ]);
    const dw = oldDims.width * el.scaleX;
    const dh = oldDims.height * el.scaleY;
    const scaleX = newDims.width > 0 ? dw / newDims.width : el.scaleX;
    const scaleY = newDims.height > 0 ? dh / newDims.height : el.scaleY;
    return { primary: newSrc, scaleX, scaleY };
  } catch {
    return { primary: newSrc, scaleX: el.scaleX, scaleY: el.scaleY };
  }
}
