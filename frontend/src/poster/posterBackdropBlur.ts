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
 * Should be called with 'this' bound to the Fabric object.
 */
export function buildShapeClipPath(this: any, ctx: TContext2D, el: PosterShapeElement | PosterPathElement) {
  const w = this.width;
  const h = this.height;
  const x = -w / 2;
  const y = -h / 2;

  ctx.beginPath();
  if (el.type === 'rect') {
    const shape = el as PosterShapeElement;
    if (rectHasPerCornerRadii(shape)) {
      const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
      const d = roundedRectPathD(w, h, tl, tr, br, bl);
      const p2d = new Path2D(d);
      const m = ctx.getTransform();
      ctx.translate(x, y);
      ctx.clip(p2d);
      ctx.setTransform(m);
      return;
    } else {
      const rx = shape.rx ?? 0;
      (ctx as any).roundRect(x, y, w, h, rx);
    }
  } else if (el.type === 'circle') {
    const r = this.radius || (el as PosterShapeElement).radius || (w / 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (el.type === 'ellipse') {
    const rx = this.rx || (el as PosterShapeElement).rx || (w / 2);
    const ry = this.ry || (el as PosterShapeElement).ry || (h / 2);
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  } else if (el.type === 'triangle') {
    ctx.moveTo(0, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (el.type === 'polygon') {
    const pts = this.points || (el as PosterShapeElement).polygonPoints;
    if (pts && pts.length > 0) {
      const areCentered = !!this.points;
      const ox = areCentered ? 0 : x;
      const oy = areCentered ? 0 : y;
      ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
      }
      ctx.closePath();
    }
  } else if (el.type === 'path') {
    const d = pathPointsToPathD(el.pathPoints, (el as PosterPathElement).closed ?? false, (el as PosterPathElement).islands);
    const p2d = new Path2D(d);
    const m = ctx.getTransform();
    if (this.pathOffset) {
        ctx.translate(-this.pathOffset.x, -this.pathOffset.y);
    }
    ctx.clip(p2d, (el as PosterPathElement).fillRule ?? 'nonzero');
    ctx.setTransform(m);
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
    buildShapeClipPath.call(this, ctx, el);

    // 2. Draw blurred backdrop
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const blurPx = (blurVal / 100) * 60;
    ctx.filter = `blur(${blurPx}px)`;

    try {
      ctx.drawImage(backdrop, 0, 0);
    } catch (e) {
      console.warn("Backdrop blur skipped: Poster contains cross-origin content.");
    }

    // Optional white tint for frosted effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.setTransform(m);

    const w = this.width;
    const h = this.height;
    ctx.fillRect(-w/2, -h/2, w, h);

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
