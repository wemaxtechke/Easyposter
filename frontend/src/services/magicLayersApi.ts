import { apiUrl } from '../lib/apiUrl';

/** Normalized 0–1 coordinates relative to source image (Vision / layout). */
export interface BboxNorm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MagicLayerOcrDto {
  text: string;
  bboxNorm: BboxNorm;
  /** Estimated number of visual lines in this paragraph. */
  lineCount: number;
  /** Whether the majority of words in this paragraph appear bold. */
  isBold: boolean;
  positionX: number;
  positionY: number;
  positionZ: number;
  scale: number;
  fontSize: number;
}

export interface MagicImageRegionDto {
  name: string;
  score: number;
  bboxNorm: BboxNorm;
}

export interface MagicLayersResponse {
  imageWidth: number | null;
  imageHeight: number | null;
  layers: MagicLayerOcrDto[];
  imageRegions: MagicImageRegionDto[];
  /** data-URL of the poster image with text regions inpainted (erased). null if unavailable. */
  inpaintedImageBase64: string | null;
  warning?: string;
}

export async function requestMagicLayersFromImage(
  file: File,
  maxLayers = 30
): Promise<MagicLayersResponse> {
  const fd = new FormData();
  fd.append('image', file);
  fd.append('maxLayers', String(maxLayers));

  const res = await fetch(apiUrl('/api/magic-layers'), {
    method: 'POST',
    body: fd,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<MagicLayersResponse>;
  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Magic layers request failed');
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return {
    imageWidth: data.imageWidth ?? null,
    imageHeight: data.imageHeight ?? null,
    layers: data.layers ?? [],
    imageRegions: data.imageRegions ?? [],
    inpaintedImageBase64: data.inpaintedImageBase64 ?? null,
    warning: data.warning,
  };
}
