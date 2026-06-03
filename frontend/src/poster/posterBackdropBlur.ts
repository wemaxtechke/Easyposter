import { util, Path, type Canvas, FabricObject } from 'fabric';
import { usePosterStore } from './store/posterStore';
import { canvasBackgroundToCanvas2D } from './types';
import type { PosterElement, PosterShapeElement, PosterPathElement } from './types';
import { pathPointsToPathD } from './path/penToolMath';
import { rectHasPerCornerRadii, roundedRectPathD, perCornerRadiiFromShape } from './roundedRectPath';
type BlurCapableFabric = FabricObject & {
  data?: { posterId?: string };
  __posterOrigRender?: (ctx: CanvasRenderingContext2D) => void;
  __posterBackdropBlurInstalled?: boolean;
};

const backdropCacheByCanvas = new WeakMap<Canvas, Map<number, HTMLCanvasElement>>();

const BLUR_SHAPE_TYPES = new Set([
  'rect',
  'circle',
  'triangle',
  'ellipse',
  'polygon',
  'path',
]);

export function posterElementSupportsBackdropBlur(el: PosterElement): boolean {
  return BLUR_SHAPE_TYPES.has(el.type);
}

/** Clear per-frame backdrop cache at the start of each Fabric render pass. */
export function registerBackdropBlurOnCanvas(canvas: Canvas): void {
  const marked = canvas as Canvas & { __posterBackdropBlurRegistered?: boolean };
  if (marked.__posterBackdropBlurRegistered) return;
  marked.__posterBackdropBlurRegistered = true;
  canvas.on('before:render', () => {
    backdropCacheByCanvas.set(canvas, new Map());
  });
}

function getBackdropCache(canvas: Canvas): Map<number, HTMLCanvasElement> {
  let cache = backdropCacheByCanvas.get(canvas);
  if (!cache) {
    cache = new Map();
    backdropCacheByCanvas.set(canvas, cache);
  }
  return cache;
}

/** Render poster background + all objects below `fabricObj` into an offscreen canvas. */
export function captureBackdropBelowObject(
  canvas: Canvas,
  fabricObj: FabricObject,
): HTMLCanvasElement | null {
  try {
    const objects = canvas.getObjects();
    const idx = objects.indexOf(fabricObj);
    if (idx < 0) return null;

    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const bg = usePosterStore.getState().canvasBackground;
    canvasBackgroundToCanvas2D(ctx, bg, w, h);

    // Poster zoom is CSS-only; capture in design/canvas space (no viewportTransform).
    for (let i = 0; i < idx; i++) {
      objects[i].render(ctx);
    }
    return c;
  } catch {
    return null;
  }
}

/** Axis-aligned sample rect in canvas/design coordinates (matches captureBackdropBelowObject). */
function getCanvasSampleRect(obj: FabricObject): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dstW: number;
  dstH: number;
} {
  const dstW = Math.max(1, obj.width ?? 1);
  const dstH = Math.max(1, obj.height ?? 1);
  const m = obj.calcTransformMatrix();
  const tl = util.transformPoint({ x: 0, y: 0 }, m);
  const tr = util.transformPoint({ x: dstW, y: 0 }, m);
  const bl = util.transformPoint({ x: 0, y: dstH }, m);
  const br = util.transformPoint({ x: dstW, y: dstH }, m);
  const minX = Math.min(tl.x, tr.x, bl.x, br.x);
  const minY = Math.min(tl.y, tr.y, bl.y, br.y);
  const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
  const maxY = Math.max(tl.y, tr.y, bl.y, br.y);
  return {
    sx: Math.max(0, Math.round(minX)),
    sy: Math.max(0, Math.round(minY)),
    sw: Math.max(1, Math.round(maxX - minX)),
    sh: Math.max(1, Math.round(maxY - minY)),
    dstW,
    dstH,
  };
}

function applyShapeClip(
  ctx: CanvasRenderingContext2D,
  el: PosterElement | undefined,
  dstW: number,
  dstH: number,
  pathOffsetX = 0,
  pathOffsetY = 0,
): void {
  if (!el || !posterElementSupportsBackdropBlur(el)) {
    ctx.beginPath();
    ctx.rect(0, 0, dstW, dstH);
    ctx.clip();
    return;
  }

  if (el.type === 'path') {
    const pathEl = el as PosterPathElement;
    if (pathEl.pathPoints?.length) {
      try {
        const d = pathPointsToPathD(pathEl.pathPoints, pathEl.closed ?? false);
        ctx.translate(-pathOffsetX, -pathOffsetY);
        ctx.clip(new Path2D(d));
        return;
      } catch {
        ctx.beginPath();
        ctx.rect(0, 0, dstW, dstH);
        ctx.clip();
        return;
      }
    }
    ctx.beginPath();
    ctx.rect(0, 0, dstW, dstH);
    ctx.clip();
    return;
  }

  const shape = el as PosterShapeElement;
  ctx.beginPath();

  if (el.type === 'rect') {
    if (rectHasPerCornerRadii(shape)) {
      const rw = shape.width ?? dstW;
      const rh = shape.height ?? dstH;
      const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
      try {
        const d = roundedRectPathD(rw, rh, tl, tr, br, bl);
        if (pathOffsetX !== 0 || pathOffsetY !== 0) {
          ctx.translate(-pathOffsetX, -pathOffsetY);
        }
        ctx.clip(new Path2D(d));
        return;
      } catch {
        ctx.rect(0, 0, dstW, dstH);
        ctx.clip();
        return;
      }
    }
    ctx.rect(0, 0, dstW, dstH);
    ctx.clip();
    return;
  }

  if (el.type === 'circle') {
    const r = shape.radius ?? dstW / 2;
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip();
    return;
  }

  if (el.type === 'ellipse') {
    const rx = shape.rx ?? dstW / 2;
    const ry = shape.ry ?? dstH / 2;
    ctx.ellipse(dstW / 2, dstH / 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    return;
  }

  if (el.type === 'triangle') {
    const w = dstW;
    const h = dstH;
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.clip();
    return;
  }

  if (el.type === 'polygon' && shape.polygonPoints?.length) {
    const pts = shape.polygonPoints;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.clip();
    return;
  }

  ctx.rect(0, 0, dstW, dstH);
  ctx.clip();
}

export function removeBackdropBlur(obj: FabricObject): void {
  const o = obj as BlurCapableFabric;
  if (!o.__posterBackdropBlurInstalled || !o.__posterOrigRender) return;
  o._render = o.__posterOrigRender;
  delete o.__posterOrigRender;
  delete o.__posterBackdropBlurInstalled;
}

function installBackdropBlur(obj: FabricObject, canvas: Canvas): void {
  const o = obj as BlurCapableFabric;
  if (o.__posterBackdropBlurInstalled) {
    o.objectCaching = false;
    return;
  }

  o.__posterOrigRender = o._render.bind(obj);
  o.__posterBackdropBlurInstalled = true;
  o.objectCaching = false;

  o._render = function (this: BlurCapableFabric, ctx: CanvasRenderingContext2D) {
    const orig = this.__posterOrigRender;
    if (!orig) return;

    try {
      const posterId = this.data?.posterId;
      const el = posterId
        ? usePosterStore.getState().elements.find((e) => e.id === posterId)
        : undefined;
      const blurVal =
        el && posterElementSupportsBackdropBlur(el)
          ? ((el as PosterShapeElement | PosterPathElement).adjustBlur ?? 0)
          : 0;

      if (blurVal > 0) {
        const objects = canvas.getObjects();
        const idx = objects.indexOf(this);
        let snap: HTMLCanvasElement | null = null;
        if (idx >= 0) {
          const cache = getBackdropCache(canvas);
          snap = cache.get(idx) ?? null;
          if (!snap) {
            snap = captureBackdropBelowObject(canvas, this);
            if (snap) cache.set(idx, snap);
          }
        }

        if (snap) {
          const { sx, sy, sw, sh, dstW, dstH } = getCanvasSampleRect(this);
          const pathOffsetX = this instanceof Path ? (this.pathOffset?.x ?? 0) : 0;
          const pathOffsetY = this instanceof Path ? (this.pathOffset?.y ?? 0) : 0;

          ctx.save();
          applyShapeClip(ctx, el, dstW, dstH, pathOffsetX, pathOffsetY);

          const blurPx = Math.max(0, Math.round((blurVal / 100) * 60));
          ctx.filter = `blur(${blurPx}px)`;
          ctx.drawImage(snap, sx, sy, sw, sh, 0, 0, dstW, dstH);
          ctx.filter = 'none';

          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.fill();
          ctx.restore();
        }
      }
    } catch {
      // skip blur on capture/clip errors (e.g. tainted canvas)
    }

    orig.call(this, ctx);
  };
}

/** Install, update, or remove backdrop blur hook from store element state. */
export function syncBackdropBlur(obj: FabricObject, canvas: Canvas, el: PosterElement): void {
  if (!posterElementSupportsBackdropBlur(el)) {
    removeBackdropBlur(obj);
    return;
  }
  const blur = (el as PosterShapeElement | PosterPathElement).adjustBlur ?? 0;
  if (blur <= 0) {
    removeBackdropBlur(obj);
    return;
  }
  installBackdropBlur(obj, canvas);
}
