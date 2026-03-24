import { Client } from '@gradio/client';

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
