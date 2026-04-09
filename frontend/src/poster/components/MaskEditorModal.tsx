import { useEffect, useMemo, useState } from 'react';
import type { PosterElement, PosterImageElement, Poster3DTextElement, PosterImageMask } from '../types';
import { posterRasterSrc } from '../posterRaster';
import { bakeMaskedImage } from '../utils/bakeMaskedImage';

interface MaskEditorModalProps {
  open: boolean;
  target: PosterImageElement | Poster3DTextElement;
  onClose: () => void;
  onApply: (updates: Partial<PosterElement>) => void;
}

const STAGE_W = 540;
const STAGE_H = 340;

export function MaskEditorModal({ open, target, onClose, onApply }: MaskEditorModalProps) {
  const [mask, setMask] = useState<PosterImageMask>(target.mask ?? 'circle');
  const [cornerRadius, setCornerRadius] = useState(target.maskCornerRadius ?? 0.18);
  const [offsetX, setOffsetX] = useState(target.maskImageOffsetX ?? 0.5);
  const [offsetY, setOffsetY] = useState(target.maskImageOffsetY ?? 0.5);
  const [zoom, setZoom] = useState(target.maskImageScale ?? 1);
  const [maskScale, setMaskScale] = useState(target.maskScale ?? 1);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const previewSrc = target.originalSrc ?? posterRasterSrc(target);

  useEffect(() => {
    if (!open) return;
    setMask(target.mask ?? 'circle');
    setCornerRadius(target.maskCornerRadius ?? 0.18);
    setOffsetX(target.maskImageOffsetX ?? 0.5);
    setOffsetY(target.maskImageOffsetY ?? 0.5);
    setZoom(target.maskImageScale ?? 1);
    setMaskScale(target.maskScale ?? 1);
    setImgNaturalSize(null);
    setDragStart(null);
  }, [
    open,
    target.id,
    target.type,
    target.type === '3d-text' ? target.image : (target as PosterImageElement).src,
    target.originalSrc,
    target.mask,
    target.maskCornerRadius,
    target.maskImageOffsetX,
    target.maskImageOffsetY,
    target.maskImageScale,
    target.maskScale,
  ]);

  const shape = mask === 'none' ? 'circle' : mask;
  const hasMask = mask !== 'none';
  const short = Math.min(STAGE_W, STAGE_H);
  const baseMask = useMemo(() => {
    if (shape === 'circle') return { w: short * 0.7, h: short * 0.7 };
    if (shape === 'ellipse') return { w: STAGE_W * 0.72, h: STAGE_H * 0.58 };
    return { w: STAGE_W * 0.72, h: STAGE_H * 0.72 };
  }, [shape, short]);

  const maskW = Math.max(36, Math.min(STAGE_W * 0.95, baseMask.w * maskScale));
  const maskH = Math.max(36, Math.min(STAGE_H * 0.95, baseMask.h * maskScale));

  const imgDisplaySize = useMemo(() => {
    if (!imgNaturalSize || imgNaturalSize.w < 1 || imgNaturalSize.h < 1)
      return { w: STAGE_W * zoom, h: STAGE_H * zoom };
    const { w: nw, h: nh } = imgNaturalSize;
    const fitScale = Math.min(STAGE_W / nw, STAGE_H / nh);
    return {
      w: nw * fitScale * zoom,
      h: nh * fitScale * zoom,
    };
  }, [imgNaturalSize, zoom]);

  // Map offset (0-1 = position within source image) to stage coords.
  // Image is centered in stage; offset 0 = left of image, 1 = right.
  const imgLeft = STAGE_W / 2 - imgDisplaySize.w / 2;
  const imgTop = STAGE_H / 2 - imgDisplaySize.h / 2;
  const cx = imgLeft + offsetX * imgDisplaySize.w;
  const cy = imgTop + offsetY * imgDisplaySize.h;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold">Mask editor</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Resize the picture, then drag the mask to pick the visible area.
          </p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-[1fr,220px]">
          <div
            className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
            style={{ width: STAGE_W, height: STAGE_H, maxWidth: '100%' }}
            onMouseMove={(e) => {
              if (!dragStart) return;
              const dx = e.clientX - dragStart.x;
              const dy = e.clientY - dragStart.y;
              const pxToOffsetX = imgDisplaySize.w > 0 ? 1 / imgDisplaySize.w : 0;
              const pxToOffsetY = imgDisplaySize.h > 0 ? 1 / imgDisplaySize.h : 0;
              const nextX = Math.max(0, Math.min(1, dragStart.offsetX + dx * pxToOffsetX));
              const nextY = Math.max(0, Math.min(1, dragStart.offsetY + dy * pxToOffsetY));
              setOffsetX(nextX);
              setOffsetY(nextY);
            }}
            onMouseUp={() => setDragStart(null)}
            onMouseLeave={() => setDragStart(null)}
          >
            <img
              src={previewSrc}
              alt="Mask preview"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
              style={{
                width: `${imgDisplaySize.w}px`,
                height: `${imgDisplaySize.h}px`,
                transform: 'translate(-50%, -50%)',
              }}
              onLoad={(e) => {
                const el = e.currentTarget;
                const nw = el.naturalWidth || el.width;
                const nh = el.naturalHeight || el.height;
                if (nw > 0 && nh > 0) setImgNaturalSize({ w: nw, h: nh });
              }}
            />

            {hasMask && (
              <div
                className="absolute border-2 border-white/95 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]"
                style={{
                  left: cx - maskW / 2,
                  top: cy - maskH / 2,
                  width: maskW,
                  height: maskH,
                  borderRadius:
                    shape === 'circle'
                      ? '9999px'
                      : shape === 'ellipse'
                        ? '50%'
                        : `${Math.round(cornerRadius * 100)}%`,
                  cursor: dragStart ? 'grabbing' : 'grab',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDragStart({
                    x: e.clientX,
                    y: e.clientY,
                    offsetX,
                    offsetY,
                  });
                }}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3 overflow-hidden pr-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">Shape</label>
              <select
                value={mask}
                onChange={(e) => setMask(e.target.value as PosterImageMask)}
                className="rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="none">None (full image)</option>
                <option value="circle">Circle</option>
                <option value="ellipse">Ellipse</option>
                <option value="rounded-rect">Rounded rectangle</option>
              </select>
            </div>
            {mask === 'rounded-rect' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">
                  Corner roundness ({Math.round(cornerRadius * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.02}
                  max={0.45}
                  step={0.01}
                  value={cornerRadius}
                  onChange={(e) => setCornerRadius(parseFloat(e.target.value))}
                  className="w-full min-w-0"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">
                Image size ({Math.round(zoom * 100)}%)
              </label>
              <input
                type="range"
                min={60}
                max={300}
                step={5}
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(parseInt(e.target.value, 10) / 100)}
                className="w-full min-w-0"
              />
            </div>
            {hasMask && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-600 dark:text-zinc-400">
                  Mask size ({Math.round(maskScale * 100)}%)
                </label>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={Math.round(maskScale * 100)}
                  onChange={(e) => setMaskScale(parseInt(e.target.value, 10) / 100)}
                  className="w-full min-w-0"
                />
              </div>
            )}
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {hasMask
                ? 'Drag the white mask shape on top of the picture to choose the kept area.'
                : 'Select a shape to apply a mask, or click Apply to keep the full image.'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (mask !== 'none') {
                const baked = await bakeMaskedImage({
                  src: previewSrc,
                  mask,
                  offsetX,
                  offsetY,
                  zoom,
                  maskScale,
                  maskCornerRadius: cornerRadius,
                });
                const baseUrl = posterRasterSrc(target);
                const updates: Partial<PosterElement> =
                  target.type === '3d-text'
                    ? {
                        image: baked,
                        originalSrc: target.originalSrc ?? baseUrl,
                        mask: 'none',
                        maskCornerRadius: undefined,
                        maskImageOffsetX: undefined,
                        maskImageOffsetY: undefined,
                        maskImageScale: undefined,
                        maskScale: undefined,
                      }
                    : {
                        src: baked,
                        originalSrc: target.originalSrc ?? (target as PosterImageElement).src,
                        mask: 'none',
                        maskCornerRadius: undefined,
                        maskImageOffsetX: undefined,
                        maskImageOffsetY: undefined,
                        maskImageScale: undefined,
                        maskScale: undefined,
                      };
                if (target.edge === 'paper-tear' || target.edge === 'fade-paper-tear') {
                  updates.edge = target.edge === 'fade-paper-tear' ? 'fade' : 'none';
                }
                onApply(updates);
              } else if (target.originalSrc) {
                onApply(
                  target.type === '3d-text'
                    ? {
                        image: target.originalSrc,
                        originalSrc: undefined,
                        mask: 'none',
                        maskCornerRadius: undefined,
                        maskImageOffsetX: undefined,
                        maskImageOffsetY: undefined,
                        maskImageScale: undefined,
                        maskScale: undefined,
                      }
                    : {
                        src: target.originalSrc,
                        originalSrc: undefined,
                        mask: 'none',
                        maskCornerRadius: undefined,
                        maskImageOffsetX: undefined,
                        maskImageOffsetY: undefined,
                        maskImageScale: undefined,
                        maskScale: undefined,
                      }
                );
              } else {
                onApply({
                  mask: 'none',
                  maskCornerRadius: mask === 'rounded-rect' ? cornerRadius : undefined,
                  maskImageOffsetX: offsetX,
                  maskImageOffsetY: offsetY,
                  maskImageScale: zoom,
                  maskScale,
                });
              }
              onClose();
            }}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
