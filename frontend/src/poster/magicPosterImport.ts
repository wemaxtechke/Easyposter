import type { MagicLayersResponse, BboxNorm } from '../services/magicLayersApi';
import type { PosterImageElement, PosterTextElement } from './types';

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = dataUrl;
  });
}

function bboxNormToPx(bn: BboxNorm, imgW: number, imgH: number) {
  return {
    minX: bn.minX * imgW,
    minY: bn.minY * imgH,
    maxX: bn.maxX * imgW,
    maxY: bn.maxY * imgH,
  };
}

function cropDataUrl(dataUrl: string, px: { minX: number; minY: number; maxX: number; maxY: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(px.maxX - px.minX));
      const h = Math.max(1, Math.round(px.maxY - px.minY));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      try {
        ctx.drawImage(img, px.minX, px.minY, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Crop failed'));
      }
    };
    img.onerror = () => reject(new Error('Crop: image load failed'));
    img.src = dataUrl;
  });
}

const imageBaseDefaults: Pick<
  PosterImageElement,
  'type' | 'mask' | 'edge' | 'edgeFadeAmount' | 'edgeFadeMinOpacity' | 'edgeFadeDirection' | 'edgeTearSeed' | 'maskCornerRadius' | 'angle' | 'opacity'
> = {
  type: 'image',
  mask: 'none',
  edge: 'none',
  edgeFadeAmount: 0.4,
  edgeFadeMinOpacity: 0,
  edgeFadeDirection: 'radial',
  edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
  maskCornerRadius: 0.18,
  angle: 0,
  opacity: 1,
};

export type PosterMagicImportPayload = {
  background?: Omit<PosterImageElement, 'id' | 'zIndex'>;
  regionImages: Omit<PosterImageElement, 'id' | 'zIndex'>[];
  texts: Omit<PosterTextElement, 'id' | 'zIndex'>[];
};

/**
 * Turn Vision API response + the same image as a data URL into poster elements
 * (background fit, optional cropped “object” regions, text boxes on top).
 */
export async function buildPosterMagicImport(
  api: MagicLayersResponse,
  canvasWidth: number,
  canvasHeight: number,
  sourceDataUrl: string,
  options: { includeBackground?: boolean; includeObjectCrops?: boolean } = {}
): Promise<PosterMagicImportPayload> {
  const includeBackground = options.includeBackground !== false;
  const includeObjectCrops = options.includeObjectCrops !== false;

  const natural = await loadImageSize(sourceDataUrl);
  const W = api.imageWidth ?? natural.w;
  const H = api.imageHeight ?? natural.h;

  const fitScale = Math.min(canvasWidth / W, canvasHeight / H);
  const ox = (canvasWidth - W * fitScale) / 2;
  const oy = (canvasHeight - H * fitScale) / 2;

  const regionImages: Omit<PosterImageElement, 'id' | 'zIndex'>[] = [];

  let background: Omit<PosterImageElement, 'id' | 'zIndex'> | undefined;
  if (includeBackground) {
    background = {
      ...imageBaseDefaults,
      src: sourceDataUrl,
      left: Math.round(ox * 1000) / 1000,
      top: Math.round(oy * 1000) / 1000,
      scaleX: fitScale,
      scaleY: fitScale,
    };
  }

  if (includeObjectCrops && api.imageRegions?.length) {
    for (const reg of api.imageRegions) {
      try {
        const px = bboxNormToPx(reg.bboxNorm, W, H);
        const cropped = await cropDataUrl(sourceDataUrl, px);
        const bw = px.maxX - px.minX;
        const bh = px.maxY - px.minY;
        regionImages.push({
          ...imageBaseDefaults,
          src: cropped,
          left: Math.round((ox + px.minX * fitScale) * 1000) / 1000,
          top: Math.round((oy + px.minY * fitScale) * 1000) / 1000,
          scaleX: fitScale,
          scaleY: fitScale,
        });
      } catch {
        /* skip bad crop */
      }
    }
  }

  const texts: Omit<PosterTextElement, 'id' | 'zIndex'>[] = [];
  for (const layer of api.layers) {
    const bn = layer.bboxNorm;
    if (!bn) continue;
    const boxHCanvas = (bn.maxY - bn.minY) * H * fitScale;
    const fontSize = Math.round(
      Math.max(12, Math.min(160, boxHCanvas * 0.82 || layer.fontSize * fitScale * 0.12))
    );
    const left = ox + bn.minX * W * fitScale;
    const top = oy + bn.minY * H * fitScale;
    const width = Math.max(48, (bn.maxX - bn.minX) * W * fitScale);

    texts.push({
      type: 'text',
      text: layer.text,
      fontSize: fontSize || 24,
      fontFamily: 'Arial Black, sans-serif',
      fill: '#111111',
      left: Math.round(left * 1000) / 1000,
      top: Math.round(top * 1000) / 1000,
      width: Math.round(width * 1000) / 1000,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
    });
  }

  return { background, regionImages, texts };
}
