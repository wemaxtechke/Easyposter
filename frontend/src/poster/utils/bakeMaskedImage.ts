import type { PosterImageMask } from '../types';

export interface BakeMaskParams {
  src: string;
  mask: PosterImageMask;
  offsetX: number;
  offsetY: number;
  zoom: number;
  maskScale: number;
  maskCornerRadius?: number;
  /** Output scale factor (e.g. 2 for retina). */
  resolutionScale?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const co = /^https?:\/\//i.test(src) ? 'anonymous' : undefined;
    if (co) img.crossOrigin = co;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

/**
 * Renders the masked region of an image to a new bitmap (data URL).
 * Matches the Mask editor modal's coordinate mapping so WYSIWYG.
 */
export async function bakeMaskedImage(params: BakeMaskParams): Promise<string> {
  const {
    src,
    mask,
    offsetX,
    offsetY,
    zoom,
    maskScale,
    maskCornerRadius = 0.18,
    resolutionScale = 2,
  } = params;

  if (mask === 'none') {
    return src;
  }

  const img = await loadImage(src);
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;

  const STAGE_W = 540;
  const STAGE_H = 340;
  const fitScale = Math.min(STAGE_W / nw, STAGE_H / nh);
  const imgDisplayW = nw * fitScale * zoom;
  const imgDisplayH = nh * fitScale * zoom;

  const short = Math.min(STAGE_W, STAGE_H);
  let baseMaskW: number;
  let baseMaskH: number;
  if (mask === 'circle') {
    baseMaskW = baseMaskH = short * 0.7;
  } else if (mask === 'ellipse') {
    baseMaskW = STAGE_W * 0.72;
    baseMaskH = STAGE_H * 0.58;
  } else {
    baseMaskW = baseMaskH = STAGE_W * 0.72;
  }
  const maskW = Math.max(36, Math.min(STAGE_W * 0.95, baseMaskW * maskScale));
  const maskH = Math.max(36, Math.min(STAGE_H * 0.95, baseMaskH * maskScale));

  const cropW = nw * (maskW / imgDisplayW);
  const cropH = nh * (maskH / imgDisplayH);
  const centerX = offsetX * nw;
  const centerY = offsetY * nh;
  const cropX = Math.max(0, Math.min(nw - cropW, centerX - cropW / 2));
  const cropY = Math.max(0, Math.min(nh - cropH, centerY - cropH / 2));

  let outW: number;
  let outH: number;
  if (mask === 'circle') {
    const side = Math.min(cropW, cropH);
    outW = outH = Math.max(1, Math.round(side * resolutionScale));
  } else {
    outW = Math.max(1, Math.round(cropW * resolutionScale));
    outH = Math.max(1, Math.round(cropH * resolutionScale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  ctx.save();
  if (mask === 'circle') {
    ctx.beginPath();
    ctx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
    ctx.clip();
  } else if (mask === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(outW / 2, outH / 2, outW / 2, outH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
  } else if (mask === 'rounded-rect') {
    const t = Math.min(outW, outH);
    const r = Math.min(t * maskCornerRadius, outW / 2, outH / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, outW, outH, r);
    ctx.clip();
  }
  ctx.drawImage(
    img,
    cropX, cropY, cropW, cropH,
    0, 0, outW, outH
  );
  ctx.restore();

  return canvas.toDataURL('image/png');
}
