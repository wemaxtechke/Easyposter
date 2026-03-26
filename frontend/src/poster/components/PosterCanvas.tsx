import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import {
  Canvas,
  Rect,
  Circle,
  Triangle,
  Ellipse,
  Line,
  Polygon,
  Path,
  FabricImage,
  Textbox,
  Shadow,
  ActiveSelection,
} from 'fabric';
import { usePosterStore } from '../store/posterStore';
import { setFabricCanvasRef } from '../canvasRef';
import type {
  PosterElement,
  PosterTextElement,
  Poster3DTextElement,
  PosterShapeElement,
  PosterImageElement,
  PosterShadow,
} from '../types';
import { getImageAdjustmentsKey } from '../types';
import { normalizePosterShapeFill, posterShapeFillToFabric, posterPatternFillToFabric, applyColorOpacity } from '../shapeFillFabric';
import {
  getPosterImageEffectsKey,
  resolvePosterImageFabricSrc,
  applyPosterImageClipPath,
  applyPosterImageEffectsInPlace,
  applyImageAdjustmentFilters,
} from '../imageEffects';
import { isSolidBackground, canvasBackgroundToCss } from '../types';
import {
  getPosterShapeLocalSize,
  lineStrokeFromFill,
  shapeFillFallbackForType,
} from '../posterShapeGeometry';
import {
  rectHasPerCornerRadii,
  roundedRectPathD,
  perCornerRadiiFromShape,
} from '../roundedRectPath';

/**
 * Re-apply store selection on Fabric (used after async recreate — the selectedIds effect
 * may have run while the object was missing and skipped restoring).
 */
function syncFabricSelectionFromStore(
  canvas: Canvas,
  selectedIds: string[],
  syncingRef: { current: boolean }
): void {
  if (selectedIds.length === 0) return;
  const fabricObjects = canvas.getObjects();
  const toSelect = fabricObjects.filter((o) =>
    selectedIds.includes((o as { data?: { posterId?: string } }).data?.posterId ?? '')
  );
  if (toSelect.length === 0) return;
  syncingRef.current = true;
  try {
    if (toSelect.length === 1) {
      canvas.setActiveObject(toSelect[0]);
    } else {
      const sel = new ActiveSelection(toSelect, { canvas });
      canvas.setActiveObject(sel);
    }
    canvas.requestRenderAll();
  } finally {
    syncingRef.current = false;
  }
}

function toFabricShadow(s?: PosterShadow): Shadow | null {
  if (!s) return null;
  return new Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY });
}

/** For circle mask, use square scale so the element bounds match the circle (no rect-with-circle look). */
function getMaskedImageScale(
  el: PosterImageElement,
  imgWidth: number,
  imgHeight: number
): { scaleX: number; scaleY: number } {
  const mask = el.mask ?? 'none';
  if (mask === 'circle' && imgWidth > 0 && imgHeight > 0) {
    const displayedW = imgWidth * el.scaleX;
    const displayedH = imgHeight * el.scaleY;
    const targetSize = Math.min(displayedW, displayedH);
    return {
      scaleX: targetSize / imgWidth,
      scaleY: targetSize / imgHeight,
    };
  }
  return { scaleX: el.scaleX, scaleY: el.scaleY };
}

function applyImageFlip(
  scale: { scaleX: number; scaleY: number },
  el: PosterImageElement
): { scaleX: number; scaleY: number } {
  let { scaleX, scaleY } = scale;
  if (el.flipHorizontal) scaleX *= -1;
  if (el.flipVertical) scaleY *= -1;
  return { scaleX, scaleY };
}

/** Poster id is removed from canvas while `createFabricObject` runs — don't clear Zustand selection. */
const posterFabricSrcRecreatePending = new Set<string>();

interface PosterCanvasProps {
  readOnly?: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export function PosterCanvas({ readOnly = false, viewportWidth, viewportHeight }: PosterCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !('fonts' in document);
  });

  const elements = usePosterStore((s) => s.elements);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const canvasZoom = usePosterStore((s) => s.canvasZoom);
  const canvasPan = usePosterStore((s) => s.canvasPan);
  const fitCenterNonce = usePosterStore((s) => s.fitCenterNonce);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const setSelected = usePosterStore((s) => s.setSelected);
  const updateElement = usePosterStore((s) => s.updateElement);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const initCanvas = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    // Read size/background from store here — do NOT put canvasWidth/Height/Background in
    // this callback's deps. Recreating the Fabric canvas on those changes disposes all
    // objects; the elements sync effect only runs when `elements` changes, so layers
    // would vanish until something else updates the store (e.g. Undo).
    const { canvasWidth: w, canvasHeight: h, canvasBackground: bg } = usePosterStore.getState();
    // Fabric 6+ only accepts a canvas element or id string — NOT a container div.
    // Passing a div falls through to createCanvasElement() with no parent; the Fabric
    // wrapper is never mounted, so nothing is visible (toDataURL still works off-DOM).
    let canvasEl = host.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      host.appendChild(canvasEl);
    }
    const canvas = new Canvas(canvasEl, {
      width: w,
      height: h,
      backgroundColor: isSolidBackground(bg) ? (bg.color || '#ffffff') : 'transparent',
      preserveObjectStacking: true,
    });
    canvasRef.current = canvas;
    setFabricCanvasRef(canvas);

    const onFabricSelectionChange = (e: { selected?: unknown[] }) => {
      if (syncingSelectionFromStoreRef.current) return;
      const selected = (e.selected ?? []).map((o) => (o as { data?: { posterId?: string } }).data?.posterId).filter(Boolean) as string[];
      setSelected(selected);
    };
    canvas.on('selection:created', onFabricSelectionChange);
    canvas.on('selection:updated', onFabricSelectionChange);
    canvas.on('selection:cleared', (e) => {
      if (syncingSelectionFromStoreRef.current) return;
      const deselected = (e as { deselected?: Array<{ data?: { posterId?: string } }> }).deselected;
      if (
        deselected?.some((o) => posterFabricSrcRecreatePending.has(o.data?.posterId ?? ''))
      ) {
        return;
      }
      setSelected([]);
    });
    canvas.on('object:modified', (e) => {
      // When multiple objects are moved/scaled/rotated as an ActiveSelection,
      // per-object `modified` handlers may not fire. Persist the final transforms to the store.
      const t = (e as { target?: unknown })?.target;
      if (t instanceof ActiveSelection) {
        t.setCoords();
        const storeEls = usePosterStore.getState().elements;
        for (const obj of t.getObjects()) {
          obj.setCoords();
          const id = (obj as { data?: { posterId?: string } }).data?.posterId;
          if (!id) continue;
          const el = storeEls.find((x) => x.id === id);
          if (!el) continue;

          // IMPORTANT: objects inside ActiveSelection may have left/top relative to selection.
          // Use Fabric helper to get canvas-space point.
          const pt = (obj as unknown as { getPointByOrigin(x: string, y: string): { x: number; y: number } })
            .getPointByOrigin('left', 'top');

          let scaleX = (obj as { scaleX?: number }).scaleX ?? 1;
          let scaleY = (obj as { scaleY?: number }).scaleY ?? 1;
          const angle = (obj as { angle?: number }).angle ?? 0;

          // Preserve image flip flags behavior (same logic as per-object modified handler).
          if (el.type === 'image') {
            const flipHorizontal = scaleX < 0;
            const flipVertical = scaleY < 0;
            scaleX = Math.abs(scaleX);
            scaleY = Math.abs(scaleY);
            const updates: Partial<PosterElement> = {
              left: pt.x,
              top: pt.y,
              scaleX,
              scaleY,
              angle,
              flipHorizontal,
              flipVertical,
            } as unknown as Partial<PosterElement>;
            updateElement(id, updates);
            continue;
          }

          updateElement(id, {
            left: pt.x,
            top: pt.y,
            scaleX: Math.abs(scaleX),
            scaleY: Math.abs(scaleY),
            angle,
          });
        }
      }

      pushHistory();
    });

    // Fabric creates a hidden textarea on text edit and calls .focus() on it,
    // causing the browser to scroll the page to make it visible. Prevent that.
    let preEditScrollY = 0;
    let preEditViewportScroll = { top: 0, left: 0 };

    canvas.on('text:editing:entered', () => {
      const vp = viewportRef.current;
      if (vp) {
        vp.scrollTop = preEditViewportScroll.top;
        vp.scrollLeft = preEditViewportScroll.left;
      }
      window.scrollTo(0, preEditScrollY);

      const obj = canvas.getActiveObject();
      const ta = obj && (obj as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea;
      if (ta) {
        const origFocus = HTMLTextAreaElement.prototype.focus;
        ta.focus = function (opts?: FocusOptions) {
          origFocus.call(this, { ...opts, preventScroll: true });
        };
        ta.focus();
      }
    });

    const saveScrollPositions = () => {
      preEditScrollY = window.scrollY;
      const vp = viewportRef.current;
      if (vp) {
        preEditViewportScroll = { top: vp.scrollTop, left: vp.scrollLeft };
      }
    };
    host.addEventListener('mousedown', saveScrollPositions, true);
    host.addEventListener('touchstart', saveScrollPositions, true);

    return () => {
      host.removeEventListener('mousedown', saveScrollPositions, true);
      host.removeEventListener('touchstart', saveScrollPositions, true);
      canvas.dispose();
      canvasRef.current = null;
      setFabricCanvasRef(null);
    };
  }, [setSelected, pushHistory]);

  useEffect(() => {
    return initCanvas();
  }, [initCanvas]);

  // When readOnly: allow selection (viewing) but lock movement/scale/rotation so guests can't modify
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const els = usePosterStore.getState().elements;
    for (const obj of canvas.getObjects()) {
      const id = (obj as { data?: { posterId?: string } }).data?.posterId;
      const el = id ? els.find((e) => e.id === id) : null;
      const locked = !!el?.locked;
      const lockAll = locked || readOnly;
      const updates: Record<string, unknown> = {
        selectable: true,
        evented: true,
        lockMovementX: lockAll,
        lockMovementY: lockAll,
        lockScalingX: lockAll,
        lockScalingY: lockAll,
        lockRotation: lockAll,
      };
      if (obj instanceof Textbox) {
        updates.editable = !readOnly;
      }
      obj.set(updates);
    }
    canvas.requestRenderAll();
  }, [readOnly, elements]);

  const creatingRef = useRef<Set<string>>(new Set());
  /**
   * True while we sync elements to Fabric — ignore selection:cleared / selection:* from Fabric.
   * Removing a recreated image fires selection:cleared; if we let it through, setSelected([]) runs
   * before the async object is back, and selection can never restore.
   */
  const syncingSelectionFromStoreRef = useRef(false);

  /** Per-element debounce timers for CPU-heavy filter application. */
  const adjTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Ensure web fonts are ready before creating Fabric textboxes.
  // Otherwise Fabric measures with fallback fonts and saved text can reflow on first paint.
  useEffect(() => {
    if (fontsReady || typeof document === 'undefined' || !('fonts' in document)) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        // Fail open to avoid blocking canvas forever if FontFaceSet errors.
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fontsReady]);

  // Sync store -> Fabric
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!fontsReady) return;

    syncingSelectionFromStoreRef.current = true;
    try {
      const fabricObjects = canvas.getObjects();
      const storeIds = new Set(elements.map((e) => e.id));

      // Remove from Fabric if not in store
      fabricObjects.forEach((obj) => {
        const id = (obj as { data?: { posterId?: string } }).data?.posterId;
        if (id && !storeIds.has(id)) {
          canvas.remove(obj);
          creatingRef.current.delete(id);
        }
      });

      // Add or update
      const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
      for (const el of sorted) {
        let existing = canvas.getObjects().find(
          (o) => (o as { data?: { posterId?: string } }).data?.posterId === el.id
        );

        if (el.type === 'rect' && existing) {
          const shape = el as PosterShapeElement;
          const wantsPath = rectHasPerCornerRadii(shape);
          const fabricIsPath = existing instanceof Path;
          if ((wantsPath && !fabricIsPath) || (!wantsPath && fabricIsPath)) {
            canvas.remove(existing);
            creatingRef.current.delete(el.id);
            existing = undefined;
          }
        }

        if (el.type === 'line' && existing) {
          const shape = el as PosterShapeElement;
          const wantsPath = !!shape.curveControl;
          const fabricIsPath = existing instanceof Path;
          const fabricIsLine = existing instanceof Line;
          if ((wantsPath && !fabricIsPath) || (!wantsPath && fabricIsPath)) {
            canvas.remove(existing);
            creatingRef.current.delete(el.id);
            existing = undefined;
          }
        }

        const data = (existing as { data?: { posterId?: string; imageSrc?: string; imageEffectsKey?: string; adjustmentsKey?: string } })?.data;
        const isImageLike = el.type === 'image' || el.type === '3d-text';
        const newImageSrc =
          el.type === 'image' ? el.src : el.type === '3d-text' ? (el as Poster3DTextElement).image : null;
        const newImageEffectsKey =
          el.type === 'image' ? getPosterImageEffectsKey(el as PosterImageElement) : '';
        const newAdjKey = isImageLike
          ? getImageAdjustmentsKey(el as PosterImageElement | Poster3DTextElement)
          : '';

        const needsSrcRecreate = !!existing && !!newImageSrc && data?.imageSrc !== newImageSrc;
        const needsInPlaceImageEffects =
          el.type === 'image' &&
          !!existing &&
          !!newImageSrc &&
          data?.imageSrc === newImageSrc &&
          (data?.imageEffectsKey ?? '') !== newImageEffectsKey;
        const needsAdjustmentUpdate =
          isImageLike &&
          !!existing &&
          !needsSrcRecreate &&
          !needsInPlaceImageEffects &&
          (data?.adjustmentsKey ?? '') !== newAdjKey;

        if (existing && needsInPlaceImageEffects) {
          const img = existing as FabricImage;
          const imgEl = el as PosterImageElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale = (imgEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(imgEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, imgEl);
          img.set({
            left: el.left,
            top: el.top,
            scaleX: scale.scaleX,
            scaleY: scale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
          });
          img.setCoords();
          void applyPosterImageEffectsInPlace(img, el as PosterImageElement)
            .then(() => {
              applyImageAdjustmentFilters(img, el as PosterImageElement);
              (img as { data?: Record<string, unknown> }).data = {
                ...(img as { data?: Record<string, unknown> }).data,
                adjustmentsKey: newAdjKey,
              };
              canvasRef.current?.requestRenderAll();
            })
            .catch(() => {
              canvasRef.current?.requestRenderAll();
            });
          continue;
        }

        if (existing && needsAdjustmentUpdate) {
          const img = existing as FabricImage;
          const imgEl = el as PosterImageElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale = (imgEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(imgEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, imgEl);
          img.set({
            left: el.left,
            top: el.top,
            scaleX: scale.scaleX,
            scaleY: scale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
          });
          img.setCoords();

          // Debounce the heavy pixel-processing filter pass (~80ms) so rapid
          // slider drags don't freeze the UI.
          const prevTimer = adjTimersRef.current.get(el.id);
          if (prevTimer) clearTimeout(prevTimer);

          const capturedAdj = { ...(el as PosterImageElement | Poster3DTextElement) };
          const capturedKey = newAdjKey;
          adjTimersRef.current.set(
            el.id,
            setTimeout(() => {
              adjTimersRef.current.delete(el.id);
              applyImageAdjustmentFilters(img, capturedAdj);
              (img as { data?: Record<string, unknown> }).data = {
                ...(img as { data?: Record<string, unknown> }).data,
                adjustmentsKey: capturedKey,
              };
              canvasRef.current?.requestRenderAll();
            }, 80),
          );

          canvasRef.current?.requestRenderAll();
          continue;
        }

        if (el.type === 'line' && existing && (el as PosterShapeElement).curveControl) {
          const shape = el as PosterShapeElement;
          if (existing instanceof Path) {
            const x1 = shape.x1 ?? 0;
            const y1 = shape.y1 ?? 0;
            const x2 = shape.x2 ?? 120;
            const y2 = shape.y2 ?? 80;
            const c = shape.curveControl!;
            const d = `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`;
            (existing as unknown as { _setPath(p: string, adjust?: boolean): void })._setPath(d, false);
            const fb = shapeFillFallbackForType('line');
            existing.set({
              left: el.left,
              top: el.top,
              scaleX: el.scaleX,
              scaleY: el.scaleY,
              angle: el.angle,
              opacity: el.opacity,
              originX: 'left',
              originY: 'top',
              shadow: toFabricShadow(el.shadow) ?? null,
              stroke: lineStrokeFromFill(shape.fill, fb),
              strokeWidth: shape.strokeWidth ?? 4,
              fill: '',
            });
            existing.setCoords();
            continue;
          }
        }

        if ((el as { type: string }).type === 'freehand') {
          if (existing) {
            canvas.remove(existing);
            creatingRef.current.delete(el.id);
          }
          continue;
        }

        if (existing && !needsSrcRecreate) {
          const locked = !!el.locked;
          const lockAll = locked || readOnly;
          const imgEl = el as PosterImageElement;
          const w = existing.width ?? 1;
          const h = existing.height ?? 1;
          let scale = el.type === 'image' && (imgEl.mask ?? 'none') !== 'none'
            ? getMaskedImageScale(imgEl, w, h)
            : { scaleX: el.scaleX, scaleY: el.scaleY };
          if (el.type === 'image') scale = applyImageFlip(scale, imgEl);
          const updates: Record<string, unknown> = {
            left: el.left,
            top: el.top,
            scaleX: scale.scaleX,
            scaleY: scale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
            shadow: toFabricShadow(el.shadow) ?? null,
            lockMovementX: lockAll,
            lockMovementY: lockAll,
            lockScalingX: lockAll,
            lockScalingY: lockAll,
            lockRotation: lockAll,
          };
          if (el.type === 'text') {
            const t = el as PosterTextElement;
            const fillOpacity = t.fillOpacity ?? 1;
            updates.fontSize = t.fontSize;
            if (t.fillPattern?.textureId) {
              const fo = t.fillOpacity ?? 1;
              if (fo <= 0) {
                existing.set({
                  fill: 'transparent',
                  stroke: t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null,
                  strokeWidth: t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0,
                  paintFirst: (t.strokeWidth ?? 0) > 0 ? 'stroke' : 'fill',
                });
                existing.setCoords();
                canvasRef.current?.requestRenderAll();
              } else {
                posterPatternFillToFabric(
                  t.fillPattern.textureId,
                  t.fillPattern.repeat ?? 'repeat',
                  t.fillPattern.scale ?? 1
                ).then((pat) => {
                  existing.set({
                    fill: pat,
                    stroke: t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null,
                    strokeWidth: t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0,
                    paintFirst: (t.strokeWidth ?? 0) > 0 ? 'stroke' : 'fill',
                  });
                  existing.setCoords();
                  canvasRef.current?.requestRenderAll();
                });
              }
            } else if (t.fillGradient) {
              const w = t.width ?? 200;
              const h = Math.max(50, (t.fontSize ?? 24) * 2);
              updates.fill = posterShapeFillToFabric(t.fillGradient, w, h, fillOpacity);
            } else {
              updates.fill = fillOpacity <= 0 ? 'transparent' : applyColorOpacity(t.fill ?? '#000000', fillOpacity);
            }
            updates.stroke = t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null;
            updates.strokeWidth = t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0;
            updates.paintFirst = (t.strokeWidth ?? 0) > 0 ? ('stroke' as const) : ('fill' as const);
            // Don't push store text onto Fabric while the user is typing — store is stale until exitEditing fires object:modified.
            if (!(existing instanceof Textbox && existing.isEditing)) {
              updates.text = t.text;
            }
            if (typeof t.width === 'number' && t.width > 0) updates.width = t.width;
            updates.fontFamily = t.fontFamily;
            updates.fontWeight = t.fontWeight ?? 'normal';
            updates.fontStyle = t.fontStyle ?? 'normal';
            updates.underline = t.underline ?? false;
            updates.linethrough = t.linethrough ?? false;
            updates.charSpacing = t.charSpacing ?? 0;
            updates.lineHeight = t.lineHeight ?? 1.16;
            updates.textAlign = t.textAlign ?? 'left';
          }
          if (
            el.type === 'rect' ||
            el.type === 'circle' ||
            el.type === 'triangle' ||
            el.type === 'ellipse' ||
            el.type === 'line' ||
            el.type === 'polygon'
          ) {
            const shape = el as PosterShapeElement;
            const fb = shapeFillFallbackForType(shape.type);
            if (shape.type === 'line') {
              const sw = shape.strokeWidth ?? 4;
              updates.stroke = lineStrokeFromFill(shape.fill, fb);
              updates.strokeWidth = sw;
              updates.fill = '';
              updates.x1 = shape.x1 ?? 0;
              updates.y1 = shape.y1 ?? 0;
              updates.x2 = shape.x2 ?? 120;
              updates.y2 = shape.y2 ?? 80;
              // Fabric Line._set() overwrites left/top when x1,y1,x2,y2 are set (via _setWidthHeight).
              // Omit left/top from updates; we restore them after set() below.
              delete updates.left;
              delete updates.top;
            } else {
              const { w, h } = getPosterShapeLocalSize(shape);
              const norm = normalizePosterShapeFill(shape.fill, fb);
              const fillOpacity = shape.fillOpacity ?? 1;
              const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
              const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
              if (norm.type === 'pattern') {
                posterPatternFillToFabric(
                  norm.textureId,
                  norm.repeat ?? 'repeat',
                  norm.scale ?? 1
                ).then((pat) => {
                  existing.set({ fill: pat });
                  existing.setCoords();
                  canvasRef.current?.requestRenderAll();
                });
              } else {
                updates.fill = posterShapeFillToFabric(norm, w, h, fillOpacity);
              }
              updates.stroke = stroke;
              updates.strokeWidth = strokeWidth;
              if (shape.type === 'rect') {
                if (rectHasPerCornerRadii(shape)) {
                  // Geometry rebuilt after set(); no Fabric Rect rx.
                } else {
                  const maxR = Math.min(w, h) / 2;
                  const rx = Math.min(Math.max(0, shape.rx ?? 0), maxR);
                  updates.rx = rx;
                  updates.ry = rx;
                }
              }
              if (shape.type === 'triangle') {
                updates.width = shape.width ?? 100;
                updates.height = shape.height ?? 100;
              }
              if (shape.type === 'ellipse') {
                updates.rx = shape.rx ?? 60;
                updates.ry = shape.ry ?? 40;
              }
              if (shape.type === 'polygon' && shape.polygonPoints?.length) {
                updates.points = shape.polygonPoints.map((p) => ({ x: p.x, y: p.y }));
              }
            }
          }
          existing.set(updates);
          if (
            el.type === 'rect' &&
            rectHasPerCornerRadii(el as PosterShapeElement) &&
            existing instanceof Path
          ) {
            rebuildPosterPerCornerPath(existing, el as PosterShapeElement & { type: 'rect' });
          }
          // Fabric Line._setWidthHeight overwrites left/top when x1,y1,x2,y2 are set. Restore position.
          if (el.type === 'line' && existing instanceof Line) {
            existing.set({ left: el.left, top: el.top });
          }
          existing.setCoords();
        } else if (needsSrcRecreate && existing) {
          posterFabricSrcRecreatePending.add(el.id);
          canvas.remove(existing);
          creatingRef.current.delete(el.id);
        }

        const stillExists = canvas
          .getObjects()
          .find((o) => (o as { data?: { posterId?: string } }).data?.posterId === el.id);
        if (!stillExists && !creatingRef.current.has(el.id)) {
          creatingRef.current.add(el.id);
          createFabricObject(el, readOnly)
            .then((obj) => {
              creatingRef.current.delete(el.id);
              if (obj && canvasRef.current) {
                const elIsImageLike = el.type === 'image' || el.type === '3d-text';
                const imageSrc =
                  el.type === 'image' ? el.src : el.type === '3d-text' ? (el as Poster3DTextElement).image : undefined;
                const imageEffectsKey =
                  el.type === 'image' ? getPosterImageEffectsKey(el as PosterImageElement) : undefined;
                const adjKey = elIsImageLike
                  ? getImageAdjustmentsKey(el as PosterImageElement | Poster3DTextElement)
                  : undefined;
                (obj as { data?: Record<string, unknown> }).data = {
                  posterId: el.id,
                  imageSrc,
                  ...(imageEffectsKey !== undefined ? { imageEffectsKey } : {}),
                  ...(adjKey !== undefined ? { adjustmentsKey: adjKey } : {}),
                };
                if (elIsImageLike) {
                  applyImageAdjustmentFilters(
                    obj as FabricImage,
                    el as PosterImageElement | Poster3DTextElement
                  );
                }
                obj.on('modified', () => {
                  let scaleX = obj.scaleX ?? 1;
                  let scaleY = obj.scaleY ?? 1;
                  let flipHorizontal: boolean | undefined;
                  let flipVertical: boolean | undefined;
                  if (el.type === 'image') {
                    const imgEl = el as PosterImageElement;
                    flipHorizontal = scaleX < 0;
                    flipVertical = scaleY < 0;
                    scaleX = Math.abs(scaleX);
                    scaleY = Math.abs(scaleY);
                    if ((imgEl.mask ?? 'none') === 'circle') {
                      const s = Math.min(scaleX, scaleY);
                      scaleX = s;
                      scaleY = s;
                    }
                  }
                  const updates: Record<string, unknown> = {
                    left: obj.left ?? 0,
                    top: obj.top ?? 0,
                    scaleX,
                    scaleY,
                    angle: obj.angle ?? 0,
                  };
                  if (flipHorizontal !== undefined) updates.flipHorizontal = flipHorizontal;
                  if (flipVertical !== undefined) updates.flipVertical = flipVertical;
                  if (el.type === 'text') {
                    const tb = obj as Textbox;
                    if (typeof tb.text === 'string') updates.text = tb.text;
                    if (typeof tb.width === 'number' && tb.width > 0) updates.width = tb.width;
                    updates.fontFamily = tb.fontFamily;
                    updates.fontWeight = tb.fontWeight;
                    updates.fontStyle = tb.fontStyle;
                    updates.underline = tb.underline;
                    updates.linethrough = tb.linethrough;
                    updates.charSpacing = tb.charSpacing ?? 0;
                    updates.lineHeight = tb.lineHeight ?? 1.16;
                    updates.textAlign = tb.textAlign ?? 'left';
                  }
                  if (el.type === 'line' && obj.type === 'line') {
                    const ln = obj as Line;
                    updates.x1 = ln.x1;
                    updates.y1 = ln.y1;
                    updates.x2 = ln.x2;
                    updates.y2 = ln.y2;
                    updates.strokeWidth = ln.strokeWidth ?? 4;
                  }
                  if (el.type === 'triangle') {
                    const tr = obj as Triangle;
                    if (typeof tr.width === 'number') updates.width = tr.width;
                    if (typeof tr.height === 'number') updates.height = tr.height;
                  }
                  if (el.type === 'ellipse') {
                    const ov = obj as Ellipse;
                    updates.rx = ov.rx;
                    updates.ry = ov.ry;
                  }
                  if (el.type === 'polygon') {
                    const poly = obj as Polygon;
                    if (poly.points?.length) {
                      updates.polygonPoints = poly.points.map((p) => ({ x: p.x, y: p.y }));
                    }
                  }
                  updateElement(el.id, updates as Partial<PosterElement>);
                });
                canvasRef.current.add(obj);
                obj.setCoords();
                syncFabricStackOrder(canvasRef.current, usePosterStore.getState().elements);
                syncFabricSelectionFromStore(
                  canvasRef.current,
                  usePosterStore.getState().selectedIds,
                  syncingSelectionFromStoreRef
                );
                canvasRef.current.renderAll();
              }
            })
            .finally(() => {
              posterFabricSrcRecreatePending.delete(el.id);
            });
        }
      }

      syncFabricStackOrder(canvas, elements);
      canvas.requestRenderAll();
    } finally {
      syncingSelectionFromStoreRef.current = false;
    }
  }, [elements, updateElement, readOnly, fontsReady]);

  // Update selection in Fabric (skip if Fabric already matches store to avoid discard→cleared→loop)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObject();
    const getActivePosterIds = (): string[] => {
      if (!active) return [];
      if (active instanceof ActiveSelection) {
        return active
          .getObjects()
          .map((o) => (o as { data?: { posterId?: string } }).data?.posterId)
          .filter((id): id is string => Boolean(id));
      }
      const id = (active as { data?: { posterId?: string } }).data?.posterId;
      return id ? [id] : [];
    };

    const currentFabricIds = [...getActivePosterIds()].sort().join(',');
    const wantedIds = [...selectedIds].sort().join(',');
    if (currentFabricIds === wantedIds) {
      return;
    }

    syncingSelectionFromStoreRef.current = true;
    try {
      const fabricObjects = canvas.getObjects();
      const toSelect = fabricObjects.filter(
        (o) => selectedIds.includes((o as { data?: { posterId?: string } }).data?.posterId ?? '')
      );
      if (toSelect.length > 0) {
        canvas.discardActiveObject();
        if (toSelect.length === 1) {
          canvas.setActiveObject(toSelect[0]);
        } else {
          const sel = new ActiveSelection(toSelect, { canvas });
          canvas.setActiveObject(sel);
        }
      } else {
        canvas.discardActiveObject();
      }
      canvas.requestRenderAll();
    } finally {
      syncingSelectionFromStoreRef.current = false;
    }
  }, [selectedIds]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.renderAll();
  }, [canvasWidth, canvasHeight]);

  // Update background (Fabric + wrapper; wrapper shows gradient, Fabric is transparent for gradients)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.backgroundColor = isSolidBackground(canvasBackground) ? (canvasBackground.color || '#ffffff') : 'transparent';
      canvas.renderAll();
    }
  }, [canvasBackground]);

  const bgStyle = isSolidBackground(canvasBackground)
    ? { backgroundColor: canvasBackground.color || '#ffffff' }
    : { background: canvasBackgroundToCss(canvasBackground, canvasWidth, canvasHeight) };

  const fitScale = Math.min(
    viewportWidth / canvasWidth,
    viewportHeight / canvasHeight
  );
  const scale = fitScale * canvasZoom;

  /**
   * Scroll buffer: `canvasPan` can go negative when zooming near an edge,
   * but CSS scroll positions can't be negative. SBUF shifts the poster
   * inside the content area so it's always at a positive coordinate.
   * All coordinate math (zoom, fit-center) accounts for this offset.
   */
  const SBUF = 5000;

  const lastCenteredNonceRef = useRef(0);

  // Re-center when Fit / load / canvas size changes (fitCenterNonce bumps), or first time viewport becomes valid.
  useLayoutEffect(() => {
    if (viewportWidth < 32 || viewportHeight < 32) return;
    if (fitCenterNonce === lastCenteredNonceRef.current) return;
    lastCenteredNonceRef.current = fitCenterNonce;
    const fit = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
    const z = usePosterStore.getState().canvasZoom;
    const s = fit * z;
    const sw = canvasWidth * s;
    const sh = canvasHeight * s;
    const px = Math.max(0, (viewportWidth - sw) / 2);
    const py = Math.max(0, (viewportHeight - sh) / 2);
    usePosterStore.setState({ canvasPan: { x: px, y: py } });
    viewportRef.current?.scrollTo(SBUF, SBUF);
  }, [fitCenterNonce, viewportWidth, viewportHeight, canvasWidth, canvasHeight]);

  // Ctrl+Scroll = zoom toward pointer; plain scroll = normal pan/scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const v = viewportRef.current;
      if (!v) return;
      const r = v.getBoundingClientRect();
      const vx = e.clientX - r.left + v.scrollLeft;
      const vy = e.clientY - r.top + v.scrollTop;

      const st = usePosterStore.getState();
      const z0 = st.canvasZoom;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const z1 = Math.max(0.1, Math.min(5, z0 + delta));
      if (Math.abs(z1 - z0) < 1e-9) return;

      const fit = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
      const s0 = fit * z0;
      const s1 = fit * z1;
      const { x: panX, y: panY } = st.canvasPan;
      const cx = (vx - panX - SBUF) / s0;
      const cy = (vy - panY - SBUF) / s0;
      const panXNew = vx - cx * s1 - SBUF;
      const panYNew = vy - cy * s1 - SBUF;

      usePosterStore.setState({
        canvasZoom: z1,
        canvasPan: { x: panXNew, y: panYNew },
      });
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, true);
  }, [viewportWidth, viewportHeight, canvasWidth, canvasHeight]);

  const scaledW = canvasWidth * scale;
  const scaledH = canvasHeight * scale;
  const renderX = canvasPan.x + SBUF;
  const renderY = canvasPan.y + SBUF;
  const contentW = Math.max(viewportWidth, renderX + scaledW + SBUF);
  const contentH = Math.max(viewportHeight, renderY + scaledH + SBUF);

  return (
    <div
      ref={viewportRef}
      className="h-full min-h-0 w-full min-w-0 flex-1 overflow-auto"
      title="Ctrl+Scroll to zoom toward cursor"
    >
      <div
        className="relative"
        style={{
          width: contentW,
          height: contentH,
          minWidth: viewportWidth,
          minHeight: viewportHeight,
        }}
      >
        <div
          ref={zoomWrapperRef}
          className="absolute shadow-xl ring-1 ring-zinc-200 dark:ring-zinc-700"
          style={{
            left: renderX,
            top: renderY,
            width: canvasWidth,
            height: canvasHeight,
            ...bgStyle,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ width: canvasWidth, height: canvasHeight }}
          />
        </div>
      </div>
    </div>
  );
}

function rebuildPosterPerCornerPath(
  fabricPath: InstanceType<typeof Path>,
  shape: PosterShapeElement & { type: 'rect' },
): void {
  const w = shape.width ?? 100;
  const h = shape.height ?? 80;
  const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
  const d = roundedRectPathD(w, h, tl, tr, br, bl);
  (fabricPath as unknown as { _setPath(p: string, adjust?: boolean): void })._setPath(d, false);
  fabricPath.set({ left: shape.left, top: shape.top });
}

/**
 * Fabric draws in array order (first = back). Store zIndex is lower = behind.
 * Forward/backward only changed zIndex in the store — we must reorder Fabric objects to match.
 */
function syncFabricStackOrder(canvas: Canvas, elements: PosterElement[]) {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const desired: ReturnType<Canvas['getObjects']> = [];
  for (const el of sorted) {
    const obj = canvas.getObjects().find(
      (o) => (o as { data?: { posterId?: string } }).data?.posterId === el.id
    );
    if (obj) desired.push(obj);
  }
  const current = canvas.getObjects();
  if (desired.length === 0 || desired.length !== current.length) return;

  let needsReorder = false;
  for (let i = 0; i < desired.length; i++) {
    if (current[i] !== desired[i]) {
      needsReorder = true;
      break;
    }
  }
  if (!needsReorder) return;

  for (let i = 0; i < desired.length; i++) {
    canvas.moveObjectTo(desired[i], i);
  }
}

async function createFabricObject(
  el: PosterElement,
  readOnly = false
): Promise<
  | InstanceType<typeof Rect>
  | InstanceType<typeof Path>
  | InstanceType<typeof Circle>
  | InstanceType<typeof Triangle>
  | InstanceType<typeof Ellipse>
  | InstanceType<typeof Line>
  | InstanceType<typeof Polygon>
  | InstanceType<typeof FabricImage>
  | InstanceType<typeof Textbox>
  | null
> {
  const locked = !!el.locked;
  // Fabric 7+ defaults to originX/originY 'center' - use 'left'/'top' so left/top match our stored coords
  // When locked or readOnly: prevent move/scale/rotate but keep selectable so user can select
  const lockAll = locked || readOnly;
  const common: Record<string, unknown> = {
    left: el.left,
    top: el.top,
    scaleX: el.scaleX,
    scaleY: el.scaleY,
    angle: el.angle,
    opacity: el.opacity,
    selectable: true,
    evented: true,
    lockMovementX: lockAll,
    lockMovementY: lockAll,
    lockScalingX: lockAll,
    lockScalingY: lockAll,
    lockRotation: lockAll,
    originX: 'left' as const,
    originY: 'top' as const,
  };
  const fs = toFabricShadow(el.shadow);
  if (fs) common.shadow = fs;

  async function resolveShapeFill(
    shape: PosterShapeElement,
    w: number,
    h: number
  ): Promise<ReturnType<typeof posterShapeFillToFabric>> {
    const norm = normalizePosterShapeFill(shape.fill, shapeFillFallbackForType(shape.type));
    const fillOpacity = shape.fillOpacity ?? 1;
    if (norm.type === 'pattern') {
      return posterPatternFillToFabric(
        norm.textureId,
        norm.repeat ?? 'repeat',
        norm.scale ?? 1
      );
    }
    return posterShapeFillToFabric(norm, w, h, fillOpacity);
  }

  switch (el.type) {
    case 'rect': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 80;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      if (rectHasPerCornerRadii(shape)) {
        const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
        const d = roundedRectPathD(w, h, tl, tr, br, bl);
        return new Path(d, {
          ...common,
          fill: fillValue,
          stroke,
          strokeWidth,
        });
      }
      const maxR = Math.min(w, h) / 2;
      const rx = Math.min(Math.max(0, shape.rx ?? 0), maxR);
      return new Rect({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
        rx,
        ry: rx,
      });
    }
    case 'circle': {
      const shape = el as PosterShapeElement;
      const r = shape.radius ?? 50;
      const d = r * 2;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, d, d);
      return new Circle({
        ...common,
        radius: r,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'triangle': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 100;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Triangle({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'ellipse': {
      const shape = el as PosterShapeElement;
      const rx = shape.rx ?? 60;
      const ry = shape.ry ?? 40;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, rx * 2, ry * 2);
      return new Ellipse({
        ...common,
        rx,
        ry,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'line': {
      const shape = el as PosterShapeElement;
      const fb = shapeFillFallbackForType('line');
      const stroke = lineStrokeFromFill(shape.fill, fb);
      const sw = shape.strokeWidth ?? 4;
      const x1 = shape.x1 ?? 0;
      const y1 = shape.y1 ?? 0;
      const x2 = shape.x2 ?? 120;
      const y2 = shape.y2 ?? 80;
      if (shape.curveControl) {
        const c = shape.curveControl;
        const d = `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`;
        return new Path(d, {
          ...common,
          stroke,
          strokeWidth: sw,
          fill: '',
        });
      }
      return new Line([x1, y1, x2, y2], {
        ...common,
        stroke,
        strokeWidth: sw,
        fill: '',
      });
    }
    case 'polygon': {
      const shape = el as PosterShapeElement;
      const pts = shape.polygonPoints?.length
        ? shape.polygonPoints.map((p) => ({ x: p.x, y: p.y }))
        : [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ];
      const { w, h } = getPosterShapeLocalSize(shape);
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Polygon(pts, {
        ...common,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'text': {
      const t = el as PosterTextElement;
      const fillOpacity = t.fillOpacity ?? 1;
      let textFill: string | Awaited<ReturnType<typeof posterPatternFillToFabric>> | ReturnType<typeof posterShapeFillToFabric> = t.fill ?? '#000000';
      if (t.fillPattern?.textureId && fillOpacity > 0) {
        textFill = await posterPatternFillToFabric(
          t.fillPattern.textureId,
          t.fillPattern.repeat ?? 'repeat',
          t.fillPattern.scale ?? 1
        );
      } else if (t.fillPattern?.textureId) {
        textFill = 'transparent';
      } else if (t.fillGradient) {
        const w = t.width ?? 200;
        const h = Math.max(50, (t.fontSize ?? 24) * 2);
        textFill = posterShapeFillToFabric(t.fillGradient, w, h, fillOpacity);
      } else if (typeof textFill === 'string') {
        textFill = fillOpacity <= 0 ? 'transparent' : applyColorOpacity(textFill, fillOpacity);
      }
      const stroke = t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : undefined;
      const strokeWidth = stroke ? (t.strokeWidth ?? 2) : 0;
      const text = new Textbox(t.text, {
        ...common,
        editable: !readOnly,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fill: textFill,
        stroke: stroke ?? null,
        strokeWidth,
        paintFirst: strokeWidth > 0 ? ('stroke' as const) : ('fill' as const),
        width: t.width ?? 200,
        fontWeight: t.fontWeight ?? 'normal',
        fontStyle: t.fontStyle ?? 'normal',
        underline: t.underline ?? false,
        linethrough: t.linethrough ?? false,
        charSpacing: t.charSpacing ?? 0,
        lineHeight: t.lineHeight ?? 1.16,
        textAlign: t.textAlign ?? 'left',
      });
      return text;
    }
    case 'image': {
      const imgEl = el as PosterImageElement;
      try {
        const url = await resolvePosterImageFabricSrc(imgEl);
        const opts = /^https?:\/\//i.test(url) ? { crossOrigin: 'anonymous' as const } : undefined;
        const img = await FabricImage.fromURL(url, opts);
        const w = img.width ?? 1;
        const h = img.height ?? 1;
        const baseScale = (imgEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(imgEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
        const scale = applyImageFlip(baseScale, imgEl);
        img.set({
          ...common,
          scaleX: scale.scaleX,
          scaleY: scale.scaleY,
        });
        applyPosterImageClipPath(img, imgEl);
        return img;
      } catch {
        return null;
      }
    }
    case '3d-text': {
      const src = (el as Poster3DTextElement).image;
      try {
        const opts = /^https?:\/\//i.test(src) ? { crossOrigin: 'anonymous' as const } : undefined;
        const img = await FabricImage.fromURL(src, opts);
        img.set({
          ...common,
          scaleX: el.scaleX,
          scaleY: el.scaleY,
        });
        return img;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
