import { type Canvas, type TContext2D, type FabricObject, Path } from 'fabric';
import { usePosterStore } from './store/posterStore';
import { type PosterShapeElement, type PosterPathElement, canvasBackgroundToCanvas2D } from './types';
import { pathPointsToPathD } from './path/penToolMath';
import { rectHasPerCornerRadii, roundedRectPathD, perCornerRadiiFromShape } from './roundedRectPath';

/** Per-frame cache of captured backdrops, keyed by object index in the canvas. */
const backdropCache = new Map<number, HTMLCanvasElement>();
let lastCanvas: Canvas | null = null;

function clearBackdropCache() {
  backdropCache.clear();
}

/**
 * Capture all content below the given object (background + lower objects) into an offscreen canvas.
 */
export function captureBackdropBelowObject(canvas: Canvas, fabricObj: FabricObject): HTMLCanvasElement | null {
  const objects = canvas.getObjects();
  const idx = objects.indexOf(fabricObj);

  if (lastCanvas !== canvas) {
    if (lastCanvas) {
      lastCanvas.off('before:render', clearBackdropCache);
    }
    canvas.on('before:render', clearBackdropCache);
    lastCanvas = canvas;
  }

  if (backdropCache.has(idx)) {
    return backdropCache.get(idx)!;
  }

  const { canvasWidth, canvasHeight, canvasBackground } = usePosterStore.getState();

  const offscreen = document.createElement('canvas');
  // Match lowerCanvasEl dimensions which include DPR scaling
  offscreen.width = canvas.lowerCanvasEl.width;
  offscreen.height = canvas.lowerCanvasEl.height;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;

  // 1. Draw background
  ctx.save();
  ctx.scale(dpr, dpr);
  canvasBackgroundToCanvas2D(ctx as unknown as CanvasRenderingContext2D, canvasBackground, canvasWidth, canvasHeight);
  ctx.restore();

  // 2. Draw objects below
  ctx.save();
  // Apply DPR scaling for Fabric objects as well
  ctx.scale(dpr, dpr);
  // Apply the same viewport transform as the main canvas
  const vpt = canvas.viewportTransform;
  ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);

  const below = objects.slice(0, idx);
  below.forEach(obj => {
    if (obj.visible) {
      obj.render(ctx);
    }
  });
  ctx.restore();

  backdropCache.set(idx, offscreen);
  return offscreen;
}

/**
 * Build a Path2D or set a clip region on the context matching the element's shape.
 */
export function buildShapeClipPath(ctx: TContext2D, el: PosterShapeElement | PosterPathElement) {
  ctx.beginPath();
  if (el.type === 'rect') {
    const shape = el as PosterShapeElement;
    const w = shape.width ?? 100;
    const h = shape.height ?? 80;
    if (rectHasPerCornerRadii(shape)) {
      const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
      const d = roundedRectPathD(w, h, tl, tr, br, bl);
      const p2d = new Path2D(d);
      ctx.clip(p2d);
      return;
    } else {
      const rx = shape.rx ?? 0;
      (ctx as any).roundRect(0, 0, w, h, rx);
    }
  } else if (el.type === 'circle') {
    const r = (el as PosterShapeElement).radius ?? 50;
    ctx.arc(r, r, r, 0, Math.PI * 2);
  } else if (el.type === 'ellipse') {
    const rx = (el as PosterShapeElement).rx ?? 60;
    const ry = (el as PosterShapeElement).ry ?? 40;
    ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
  } else if (el.type === 'triangle') {
    const w = (el as PosterShapeElement).width ?? 100;
    const h = (el as PosterShapeElement).height ?? 100;
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
  } else if (el.type === 'polygon') {
    const pts = (el as PosterShapeElement).polygonPoints;
    if (pts && pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }
  } else if (el.type === 'path') {
    const p = el as PosterPathElement;
    const d = pathPointsToPathD(p.pathPoints, p.closed ?? false, p.islands);
    const p2d = new Path2D(d);
    ctx.clip(p2d, p.fillRule ?? 'nonzero');
    return;
  }
  ctx.clip();
}

/**
 * Replace the Fabric object's _render method with one that captures and draws backdrop blur.
 */
export function installBackdropBlur(obj: any) {
  if (obj.__posterBackdropBlurInstalled) return;

  const origRender = obj._render.bind(obj);
  obj.__posterOrigRender = origRender;
  obj.__posterBackdropBlurInstalled = true;

  obj._render = function(ctx: TContext2D) {
    const blurVal = this.__posterBlurVal ?? 0;
    const el = this.__posterEl as PosterShapeElement | PosterPathElement | undefined;

    if (blurVal <= 0 || !this.canvas || !el) {
      this.__posterOrigRender(ctx);
      return;
    }

    const backdrop = captureBackdropBelowObject(this.canvas, this);
    if (!backdrop) {
      this.__posterOrigRender(ctx);
      return;
    }

    ctx.save();

    // 1. Clip to shape
    const w = this.width;
    const h = this.height;
    const offsetX = this._getLeftOffset();
    const offsetY = this._getTopOffset();
    ctx.translate(offsetX, offsetY);

    buildShapeClipPath(ctx, el);

    // 2. Draw blurred backdrop
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const blurPx = (blurVal / 100) * 60;
    ctx.filter = `blur(${blurPx}px)`;

    try {
      ctx.drawImage(backdrop, 0, 0);
    } catch (e) {
      // Gracefully handle CORS tainted canvas errors
      console.warn("Backdrop blur skipped: Poster contains cross-origin content.");
    }

    // Optional white tint for frosted effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.setTransform(m);
    ctx.fillRect(-w, -h, w * 2, h * 2);

    ctx.restore();

    // 3. Original render (fill/stroke)
    this.__posterOrigRender(ctx);
  };
}

export function removeBackdropBlur(obj: any) {
  if (!obj.__posterBackdropBlurInstalled) return;
  if (obj.__posterOrigRender) {
    obj._render = obj.__posterOrigRender;
  }
  delete obj.__posterBackdropBlurInstalled;
  delete obj.__posterOrigRender;
  delete obj.__posterBlurVal;
  delete obj.__posterEl;

  // Paths should not be cached in this codebase to maintain sharpness during edits
  const isPath = obj instanceof Path;
  obj.set({ objectCaching: !isPath });
}

export function syncBackdropBlur(obj: any, canvas: Canvas, el: PosterShapeElement | PosterPathElement) {
  const blurVal = el.adjustBlur ?? 0;
  obj.__posterBlurVal = blurVal;
  obj.__posterEl = el;

  if (blurVal > 0) {
    installBackdropBlur(obj);
    obj.set({ objectCaching: false });
  } else {
    removeBackdropBlur(obj);
  }
}
