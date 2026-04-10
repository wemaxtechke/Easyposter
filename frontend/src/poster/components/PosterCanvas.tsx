import { useEffect, useRef, useCallback, useState } from 'react';
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
  util,
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
import { usePosterZoom, SBUF } from '../hooks/usePosterZoom';

/**
 * Re-apply store selection on Fabric (used after async recreate — the selectedIds effect
 * may have run while the object was missing and skipped restoring).
 */
/** Full poster element ids currently selected on Fabric (ActiveSelection or single object). */
function getPosterIdsFromFabricActive(canvas: Canvas): string[] {
  const active = canvas.getActiveObject();
  if (!active) return [];
  if (active instanceof ActiveSelection) {
    return active
      .getObjects()
      .map((o) => (o as { data?: { posterId?: string } }).data?.posterId)
      .filter((id): id is string => Boolean(id));
  }
  const id = (active as { data?: { posterId?: string } }).data?.posterId;
  return id ? [id] : [];
}

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
  el: PosterImageElement | Poster3DTextElement,
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
  el: PosterImageElement | Poster3DTextElement
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
      /** Ctrl (Windows/Linux) or Cmd (macOS) + click to add/remove objects from the selection */
      selectionKey: ['ctrlKey', 'metaKey'],
    });
    canvasRef.current = canvas;
    setFabricCanvasRef(canvas);

    // Fabric's `selection:updated` only lists newly selected objects in `e.selected`, not the full set.
    // Reading `getActiveObject()` keeps Ctrl/Cmd multi-select in sync with Zustand and avoids collapsing the group.
    const onFabricSelectionChange = () => {
      if (syncingSelectionFromStoreRef.current) return;
      setSelected(getPosterIdsFromFabricActive(canvas));
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
    canvas.on('object:modified', (opt) => {
      const target = opt.target;
      if (target instanceof ActiveSelection) {
        const store = usePosterStore.getState();
        const groupMatrix = target.calcTransformMatrix();
        for (const obj of target.getObjects()) {
          const id = (obj as { data?: { posterId?: string } }).data?.posterId;
          if (!id) continue;
          const absPos = obj.getXY('left', 'top');
          const worldMatrix = util.multiplyTransformMatrices(
            groupMatrix,
            obj.calcOwnMatrix(),
          );
          const decomposed = util.qrDecompose(worldMatrix);
          store.updateElement(id, {
            left: absPos.x,
            top: absPos.y,
            scaleX: Math.abs(decomposed.scaleX),
            scaleY: Math.abs(decomposed.scaleY),
            angle: decomposed.angle,
          } as Partial<PosterElement>);
        }
      }
      pushHistory();
    });

    // Fabric creates a hidden textarea on text edit and calls .focus(),
    // which makes the browser scroll every scrollable ancestor to bring it
    // into view. Prevent this by:
    //  1. Patching focus() on any textarea Fabric inserts (MutationObserver)
    //  2. Keeping the textarea fixed at top-left so the browser has no reason to scroll
    //  3. Temporarily blocking scroll on every ancestor during edit entry

    const patchTextarea = (ta: HTMLTextAreaElement) => {
      const origFocus = HTMLTextAreaElement.prototype.focus;
      ta.focus = function (opts?: FocusOptions) {
        origFocus.call(this, { ...opts, preventScroll: true });
      };
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.pointerEvents = 'none';
    };

    const textareaObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLTextAreaElement) patchTextarea(node);
        });
      }
    });
    textareaObserver.observe(host, { childList: true, subtree: true });

    canvas.on('text:editing:entered', () => {
      const obj = canvas.getActiveObject();
      const ta = obj && (obj as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea;
      if (ta) patchTextarea(ta);
    });

    // No-op: scroll save/restore is no longer needed since the textarea is
    // always fixed at top-left and focus uses preventScroll.
    const saveScrollPositions = () => {};
    host.addEventListener('mousedown', saveScrollPositions, true);
    host.addEventListener('touchstart', saveScrollPositions, true);

    return () => {
      textareaObserver.disconnect();
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

      // Collect IDs of objects currently inside an ActiveSelection so we skip
      // overwriting their group-relative coords with the (now-absolute) store values.
      const activeObj = canvas.getActiveObject();
      const inActiveSelectionIds = new Set<string>();
      if (activeObj instanceof ActiveSelection) {
        for (const o of activeObj.getObjects()) {
          const oid = (o as { data?: { posterId?: string } }).data?.posterId;
          if (oid) inActiveSelectionIds.add(oid);
        }
      }

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
          el.type === 'image' || el.type === '3d-text'
            ? getPosterImageEffectsKey(el as PosterImageElement | Poster3DTextElement)
            : '';
        const newAdjKey = isImageLike
          ? getImageAdjustmentsKey(el as PosterImageElement | Poster3DTextElement)
          : '';

        const needsSrcRecreate = !!existing && !!newImageSrc && data?.imageSrc !== newImageSrc;
        const needsInPlaceImageEffects =
          (el.type === 'image' || el.type === '3d-text') &&
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
          const rasterEl = el as PosterImageElement | Poster3DTextElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale =
            (rasterEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(rasterEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, rasterEl);
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
          void applyPosterImageEffectsInPlace(img, rasterEl)
            .then(() => {
              applyImageAdjustmentFilters(img, rasterEl);
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
          const rasterEl = el as PosterImageElement | Poster3DTextElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale =
            (rasterEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(rasterEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, rasterEl);
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
          // Objects inside an active multi-selection have group-relative coords;
          // overwriting them with absolute store values would break their visual position.
          if (inActiveSelectionIds.has(el.id)) continue;

          const locked = !!el.locked;
          const lockAll = locked || readOnly;
          const rasterEl =
            el.type === 'image' || el.type === '3d-text' ? (el as PosterImageElement | Poster3DTextElement) : null;
          const w = existing.width ?? 1;
          const h = existing.height ?? 1;
          let scale =
            rasterEl && (rasterEl.mask ?? 'none') !== 'none'
              ? getMaskedImageScale(rasterEl, w, h)
              : { scaleX: el.scaleX, scaleY: el.scaleY };
          if (rasterEl) scale = applyImageFlip(scale, rasterEl);
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
                  el.type === 'image' || el.type === '3d-text'
                    ? getPosterImageEffectsKey(el as PosterImageElement | Poster3DTextElement)
                    : undefined;
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
                  if (el.type === 'image' || el.type === '3d-text') {
                    const imgEl = el as PosterImageElement | Poster3DTextElement;
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

  usePosterZoom({
    viewportRef,
    canvasRef,
    viewportWidth,
    viewportHeight,
    canvasWidth,
    canvasHeight,
    fitCenterNonce,
  });

  const scaledW = canvasWidth * scale;
  const scaledH = canvasHeight * scale;

  const isCompact = viewportWidth < 768;
  const effectiveSBUF = isCompact ? 0 : SBUF;

  // On mobile, use canvasPan directly (set by pinch gesture and initial fit).
  // On desktop, offset by the scroll buffer.
  const renderX = canvasPan.x + effectiveSBUF;
  const renderY = canvasPan.y + effectiveSBUF;
  const contentW = isCompact
    ? viewportWidth
    : Math.max(viewportWidth, renderX + scaledW + effectiveSBUF);
  const contentH = isCompact
    ? viewportHeight
    : Math.max(viewportHeight, renderY + scaledH + effectiveSBUF);

  return (
    <div
      ref={viewportRef}
      className={`h-full min-h-0 w-full min-w-0 flex-1 ${isCompact ? 'overflow-hidden' : 'overflow-auto'}`}
      style={{ touchAction: isCompact ? 'none' : 'auto' }}
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
    case 'image':
    case '3d-text': {
      const raster = el as PosterImageElement | Poster3DTextElement;
      try {
        const url = await resolvePosterImageFabricSrc(raster);
        const opts = /^https?:\/\//i.test(url) ? { crossOrigin: 'anonymous' as const } : undefined;
        const img = await FabricImage.fromURL(url, opts);
        const w = img.width ?? 1;
        const h = img.height ?? 1;
        const baseScale =
          (raster.mask ?? 'none') !== 'none' ? getMaskedImageScale(raster, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
        const scale = applyImageFlip(baseScale, raster);
        img.set({
          ...common,
          scaleX: scale.scaleX,
          scaleY: scale.scaleY,
        });
        applyPosterImageClipPath(img, raster);
        return img;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
