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

/**
 * Sample the dominant color from a rectangular region of an image.
 * Focuses on darker pixels (likely text) by filtering out very light ones.
 */
function sampleDominantColor(
  imgEl: HTMLImageElement,
  px: { minX: number; minY: number; maxX: number; maxY: number },
): string {
  try {
    const sw = Math.max(1, Math.round(px.maxX - px.minX));
    const sh = Math.max(1, Math.round(px.maxY - px.minY));
    const sampleW = Math.min(sw, 80);
    const sampleH = Math.min(sh, 80);
    const c = document.createElement('canvas');
    c.width = sampleW;
    c.height = sampleH;
    const ctx = c.getContext('2d');
    if (!ctx) return '#111111';
    ctx.drawImage(imgEl, px.minX, px.minY, sw, sh, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 180) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }
    if (count < 5) {
      rSum = 0; gSum = 0; bSum = 0; count = 0;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
      }
    }
    if (count === 0) return '#111111';
    const avgR = Math.round(rSum / count);
    const avgG = Math.round(gSum / count);
    const avgB = Math.round(bSum / count);
    return `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
  } catch {
    return '#111111';
  }
}

/**
 * Guess font family category: uppercase-heavy text → sans-serif bold headers;
 * short decorative text → display font; fallback sans-serif.
 */
function guessFontFamily(text: string, isBold: boolean): string {
  const upper = text.replace(/[^A-Za-z]/g, '');
  const upperRatio = upper.length > 0
    ? upper.split('').filter((c) => c === c.toUpperCase()).length / upper.length
    : 0;

  if (isBold && upperRatio > 0.7) return 'Impact, Arial Black, sans-serif';
  if (isBold) return 'Arial Black, Helvetica, sans-serif';
  if (upperRatio > 0.8) return 'Oswald, Arial, sans-serif';
  return 'Helvetica, Arial, sans-serif';
}

/**
 * Compute font size that fits `text` into a target box using an off-screen canvas.
 * Returns the largest font size where text width fits within `targetW`.
 */
function fitFontSize(
  text: string,
  targetW: number,
  targetLineH: number,
  fontFamily: string,
  fontWeight: string,
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Math.round(targetLineH * 0.75);

  let lo = 6;
  let hi = Math.round(targetLineH * 1.4);
  let best = lo;

  const lines = text.split(/\n/);
  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');

  for (let iter = 0; iter < 12; iter++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid <= lo) break;
    ctx.font = `${fontWeight} ${mid}px ${fontFamily}`;
    const measured = ctx.measureText(longestLine);
    const textW = measured.width;
    if (textW <= targetW * 1.05) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return Math.max(8, Math.min(200, best));
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
 * Wait for an HTMLImageElement to be fully loaded and decoded.
 */
function loadImgElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = dataUrl;
  });
}

/**
 * Turn Vision API response + the same image as a data URL into poster elements
 * (background fit, optional cropped "object" regions, text boxes on top).
 */
export async function buildPosterMagicImport(
  api: MagicLayersResponse,
  canvasWidth: number,
  canvasHeight: number,
  sourceDataUrl: string,
  options: { includeBackground?: boolean; includeObjectCrops?: boolean; inpaintedDataUrl?: string } = {}
): Promise<PosterMagicImportPayload> {
  const includeBackground = options.includeBackground !== false;
  const includeObjectCrops = options.includeObjectCrops !== false;

  const natural = await loadImageSize(sourceDataUrl);
  const W = api.imageWidth ?? natural.w;
  const H = api.imageHeight ?? natural.h;

  const fitScale = Math.min(canvasWidth / W, canvasHeight / H);
  const ox = (canvasWidth - W * fitScale) / 2;
  const oy = (canvasHeight - H * fitScale) / 2;

  const imgEl = await loadImgElement(sourceDataUrl);

  const regionImages: Omit<PosterImageElement, 'id' | 'zIndex'>[] = [];

  let background: Omit<PosterImageElement, 'id' | 'zIndex'> | undefined;
  if (includeBackground) {
    const bgSrc = options.inpaintedDataUrl || sourceDataUrl;
    if (options.inpaintedDataUrl) {
      const bgNatural = await loadImageSize(options.inpaintedDataUrl);
      const bgFitScale = Math.min(canvasWidth / bgNatural.w, canvasHeight / bgNatural.h);
      const bgOx = (canvasWidth - bgNatural.w * bgFitScale) / 2;
      const bgOy = (canvasHeight - bgNatural.h * bgFitScale) / 2;
      background = {
        ...imageBaseDefaults,
        src: bgSrc,
        left: Math.round(bgOx * 1000) / 1000,
        top: Math.round(bgOy * 1000) / 1000,
        scaleX: bgFitScale,
        scaleY: bgFitScale,
      };
    } else {
      background = {
        ...imageBaseDefaults,
        src: bgSrc,
        left: Math.round(ox * 1000) / 1000,
        top: Math.round(oy * 1000) / 1000,
        scaleX: fitScale,
        scaleY: fitScale,
      };
    }
  }

  if (includeObjectCrops && api.imageRegions?.length) {
    for (const reg of api.imageRegions) {
      try {
        const px = bboxNormToPx(reg.bboxNorm, W, H);
        const cropped = await cropDataUrl(sourceDataUrl, px);
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

    const boxWPx = (bn.maxX - bn.minX) * W;
    const boxHPx = (bn.maxY - bn.minY) * H;
    const boxWCanvas = boxWPx * fitScale;
    const boxHCanvas = boxHPx * fitScale;

    const lineCount = layer.lineCount || 1;
    const lineHCanvas = boxHCanvas / lineCount;

    const isBold = layer.isBold ?? false;
    const fontFamily = guessFontFamily(layer.text, isBold);
    const fontWeight = isBold ? 'bold' : 'normal';

    const fontSize = fitFontSize(
      layer.text,
      boxWCanvas,
      lineHCanvas,
      fontFamily,
      fontWeight,
    );

    const left = ox + bn.minX * W * fitScale;
    const top = oy + bn.minY * H * fitScale;
    const width = Math.max(48, boxWCanvas);

    const pxBox = bboxNormToPx(bn, W, H);
    const fill = sampleDominantColor(imgEl, pxBox);

    const isShort = layer.text.length < 40 && lineCount <= 2;
    const textAlign = isShort ? 'center' as const : 'left' as const;

    texts.push({
      type: 'text',
      text: layer.text,
      fontSize: fontSize || 24,
      fontFamily,
      fill,
      fontWeight,
      textAlign,
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
