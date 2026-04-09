import { Client } from '@gradio/client';
import type { PosterImageElement, Poster3DTextElement } from '../types';

const SPACE = 'easyposterke/remove_bg';
const SPACE_ROOT = 'https://easyposterke-remove-bg.hf.space';
const ENDPOINT = '/remove_background';

/**
 * Fetch a URL and convert the response to a data URL (base64).
 */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/**
 * Remove background from an image using the Hugging Face Space API.
 * Returns a data URL of the processed image (PNG with transparency).
 */
export async function removeBackground(input: File | Blob | string): Promise<string> {
  let blob: Blob;
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const res = await fetch(input);
      blob = await res.blob();
    } else if (input.startsWith('http')) {
      const res = await fetch(input);
      blob = await res.blob();
    } else {
      throw new Error('Invalid image input: expected File, Blob, or data/HTTP URL');
    }
  } else {
    blob = input;
  }

  const client = await Client.connect(SPACE);
  const result = await client.predict(ENDPOINT, {
    input_image: blob,
  });

  const raw = (result as { data?: unknown }).data;
  const imageData = Array.isArray(raw) ? raw[0] : raw;

  let outputUrl: string | undefined;
  if (typeof imageData === 'string') {
    outputUrl = imageData;
  } else if (imageData && typeof imageData === 'object') {
    const obj = imageData as { url?: string; path?: string };
    outputUrl = obj.url ?? (obj.path ? new URL(obj.path, SPACE_ROOT).href : undefined);
  }

  if (!outputUrl || typeof outputUrl !== 'string') {
    throw new Error('No image returned from background removal');
  }

  // Convert HF URL to data URL so the image is self-contained in the project
  return urlToDataUrl(outputUrl);
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
