import { create } from 'zustand';
import type { PosterElement, PosterProject, CanvasBackground } from '../types';
import { DEFAULT_GRADIENT_STOPS } from '../types';
import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from '../templateTypes';
import { fetchPosterTemplateById, fetchPosterTemplateList } from '../services/posterTemplatesApi';
import { generateElementId as generateId } from '../utils/generateElementId';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

let scheduleHistoryPushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleHistoryPush(push: () => void): void {
  if (scheduleHistoryPushTimer) clearTimeout(scheduleHistoryPushTimer);
  scheduleHistoryPushTimer = setTimeout(() => {
    scheduleHistoryPushTimer = null;
    push();
  }, 400);
}

interface HistoryEntry {
  elements: PosterElement[];
}

function normalizeBackground(bg: CanvasBackground | string | undefined): CanvasBackground {
  if (!bg) return { type: 'solid', color: '#ffffff' };
  if (typeof bg === 'string') {
    return /^#[0-9A-Fa-f]{6}$/.test(bg) ? { type: 'solid', color: bg } : { type: 'solid', color: '#ffffff' };
  }
  if (bg.type === 'solid') return bg;
  return {
    ...bg,
    stops: bg.stops?.length >= 2 ? bg.stops : DEFAULT_GRADIENT_STOPS,
  };
}

export type CanvasPan = { x: number; y: number };

interface PosterStore {
  elements: PosterElement[];
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: CanvasBackground;
  canvasZoom: number;
  /** Offset of the poster canvas (unscaled top-left) inside the scroll viewport; used with wheel zoom-to-cursor. */
  canvasPan: CanvasPan;
  /** Bumped when Fit / load should re-center the view in the viewport (PosterCanvas reads viewport size). */
  fitCenterNonce: number;
  selectedIds: string[];
  history: HistoryEntry[];
  historyIndex: number;
  /** Field bindings from template (key/label/sourceElementId). Null when loading from file or no template. */
  fieldBindings: PosterTemplateFieldBinding[] | null;
  addElement: (el: Omit<PosterElement, 'id' | 'zIndex'>) => void;
  /** One undo step: optional background image, cropped regions, then text layers (for Magic import). */
  batchImportMagicPoster: (payload: {
    background?: Omit<PosterElement, 'id' | 'zIndex'>;
    regionImages: Omit<PosterElement, 'id' | 'zIndex'>[];
    texts: Omit<PosterElement, 'id' | 'zIndex'>[];
  }) => void;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  setSelected: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  /** `orderedIds` is front-to-back (first = top/front). Must list every element id exactly once. */
  reorderLayersFrontToBack: (orderedIds: string[]) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasZoomFit: () => void;
  setCanvasPan: (pan: CanvasPan) => void;
  setCanvasBackground: (bg: CanvasBackground) => void;
  setElements: (elements: PosterElement[]) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  loadProject: (project: PosterProject, options?: { fieldBindings?: PosterTemplateFieldBinding[] }) => void;
  getProject: () => PosterProject;
  /** Field bindings for the current project (from template). Used by Poster AI to resolve element references. */
  getFieldBindings: () => PosterTemplateFieldBinding[] | null;
  /** Cloud (MongoDB) poster templates merged into template pickers after refresh. */
  remotePosterTemplates: PosterTemplateDefinition[];
  remotePosterTemplatesLoadState: 'idle' | 'loading' | 'ready' | 'error';
  remotePosterTemplatesLoadError: string | null;
  refreshRemotePosterTemplates: () => Promise<void>;
}

export const usePosterStore = create<PosterStore>((set, get) => ({
  elements: [],
  canvasWidth: DEFAULT_WIDTH,
  canvasHeight: DEFAULT_HEIGHT,
  canvasBackground: { type: 'solid', color: '#ffffff' },
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  fitCenterNonce: 1,
  selectedIds: [],
  history: [[]],
  historyIndex: 0,
  fieldBindings: null,
  remotePosterTemplates: [],
  remotePosterTemplatesLoadState: 'idle',
  remotePosterTemplatesLoadError: null,

  refreshRemotePosterTemplates: async () => {
    set({ remotePosterTemplatesLoadState: 'loading', remotePosterTemplatesLoadError: null });
    try {
      const list = await fetchPosterTemplateList();
      const full = await Promise.all(
        list.map((item) => fetchPosterTemplateById(item.id).catch(() => null))
      );
      const templates = full.filter((t): t is PosterTemplateDefinition => t != null);
      set({
        remotePosterTemplates: templates,
        remotePosterTemplatesLoadState: 'ready',
        remotePosterTemplatesLoadError: null,
      });
    } catch (e) {
      set({
        remotePosterTemplates: [],
        remotePosterTemplatesLoadState: 'error',
        remotePosterTemplatesLoadError:
          e instanceof Error ? e.message : 'Failed to load cloud templates',
      });
    }
  },

  addElement: (el) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    const id = generateId();
    const element: PosterElement = { ...el, id, zIndex: maxZ + 1 } as PosterElement;
    set((s) => ({ elements: [...s.elements, element], selectedIds: [id] }));
  },

  batchImportMagicPoster: (payload) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    let z = maxZ + 1;
    const newEls: PosterElement[] = [];
    if (payload.background) {
      const id = generateId();
      newEls.push({ ...payload.background, id, zIndex: z++ } as PosterElement);
    }
    for (const im of payload.regionImages) {
      const id = generateId();
      newEls.push({ ...im, id, zIndex: z++ } as PosterElement);
    }
    for (const t of payload.texts) {
      const id = generateId();
      newEls.push({ ...t, id, zIndex: z++ } as PosterElement);
    }
    if (newEls.length === 0) return;
    const lastText = [...newEls].reverse().find((e) => e.type === 'text');
    const selectId = lastText?.id ?? newEls[newEls.length - 1]!.id;
    set((s) => ({
      elements: [...s.elements, ...newEls],
      selectedIds: [selectId],
    }));
  },

  updateElement: (id, updates) => {
    set((s) => ({
      elements: s.elements.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
    scheduleHistoryPush(() => get().pushHistory());
  },

  removeElements: (ids) => {
    get().pushHistory();
    const toRemove = new Set(ids);
    set((s) => ({
      elements: s.elements.filter((e) => !toRemove.has(e.id)),
      selectedIds: s.selectedIds.filter((id) => !toRemove.has(id)),
    }));
  },

  duplicateElements: (ids) => {
    const { elements } = get();
    const toDupe = elements.filter((e) => ids.includes(e.id));
    if (toDupe.length === 0) return;
    get().pushHistory();
    const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
    const newEls: PosterElement[] = [];
    const newIds: string[] = [];
    toDupe.forEach((el, i) => {
      const id = generateId();
      newIds.push(id);
      newEls.push({
        ...JSON.parse(JSON.stringify(el)),
        id,
        left: el.left + 20,
        top: el.top + 20,
        zIndex: maxZ + 1 + i,
      });
    });
    set((s) => ({
      elements: [...s.elements, ...newEls],
      selectedIds: newIds,
    }));
  },

  setSelected: (ids) =>
    set((s) => {
      const a = s.selectedIds;
      const b = ids;
      if (a.length === b.length && a.every((id, i) => id === b[i])) {
        return s;
      }
      return { selectedIds: ids };
    }),

  bringForward: (ids) => {
    const els = get().elements;
    const sorted = [...els].sort((a, b) => a.zIndex - b.zIndex);
    const idsSet = new Set(ids);
    const toMove = sorted.filter((e) => idsSet.has(e.id));
    if (toMove.length === 0) return;
    const below = sorted.find((e) => !idsSet.has(e.id) && e.zIndex > toMove[toMove.length - 1].zIndex);
    if (!below) return;
    get().pushHistory();
    const belowZ = below.zIndex;
    set((s) => ({
      elements: s.elements.map((e) => {
        if (idsSet.has(e.id)) return { ...e, zIndex: belowZ };
        if (e.zIndex === belowZ) return { ...e, zIndex: e.zIndex - 1 };
        return e;
      }),
    }));
  },

  sendBackward: (ids) => {
    const sorted = [...get().elements].sort((a, b) => a.zIndex - b.zIndex);
    const idsSet = new Set(ids);
    const toMove = sorted.filter((e) => idsSet.has(e.id));
    if (toMove.length === 0) return;
    const above = [...sorted].filter((e) => !idsSet.has(e.id) && e.zIndex < toMove[0].zIndex).pop();
    if (!above) return;
    get().pushHistory();
    const aboveZ = above.zIndex;
    set((s) => ({
      elements: s.elements.map((e) => {
        if (idsSet.has(e.id)) return { ...e, zIndex: aboveZ };
        if (e.zIndex === aboveZ) return { ...e, zIndex: e.zIndex + 1 };
        return e;
      }),
    }));
  },

  bringToFront: (ids) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    const idsSet = new Set(ids);
    let nextZ = maxZ + 1;
    set((s) => ({
      elements: s.elements.map((e) =>
        idsSet.has(e.id) ? { ...e, zIndex: nextZ++ } : e
      ),
    }));
  },

  sendToBack: (ids) => {
    get().pushHistory();
    const minZ = Math.min(...get().elements.map((e) => e.zIndex), 0);
    const idsSet = new Set(ids);
    let nextZ = minZ - 1;
    set((s) => ({
      elements: s.elements.map((e) =>
        idsSet.has(e.id) ? { ...e, zIndex: nextZ-- } : e
      ),
    }));
  },

  reorderLayersFrontToBack: (orderedIds) => {
    const els = get().elements;
    if (orderedIds.length !== els.length || els.length === 0) return;
    const idSet = new Set(orderedIds);
    if (idSet.size !== orderedIds.length || els.some((e) => !idSet.has(e.id))) return;
    get().pushHistory();
    const n = orderedIds.length;
    const zById = new Map(orderedIds.map((id, i) => [id, n - i]));
    set((s) => ({
      elements: s.elements.map((e) => ({ ...e, zIndex: zById.get(e.id) ?? e.zIndex })),
    }));
  },

  setCanvasSize: (width, height) =>
    set((s) => ({
      canvasWidth: width,
      canvasHeight: height,
      fitCenterNonce: s.fitCenterNonce + 1,
    })),

  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),

  setCanvasZoomFit: () =>
    set((s) => ({
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 },
      fitCenterNonce: s.fitCenterNonce + 1,
    })),

  setCanvasPan: (pan) => set({ canvasPan: pan }),

  setCanvasBackground: (bg) => set({ canvasBackground: normalizeBackground(bg) }),

  setElements: (elements) => set({ elements }),

  pushHistory: () => {
    const { elements, history, historyIndex } = get();
    const snapshot = JSON.parse(JSON.stringify(elements));
    const newHistory = history.slice(0, historyIndex + 1);
    if (JSON.stringify(newHistory[newHistory.length - 1]) !== JSON.stringify(snapshot)) {
      newHistory.push(snapshot);
      if (newHistory.length > 50) newHistory.shift();
      set({ history: newHistory, historyIndex: newHistory.length - 1 });
    }
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({ elements: JSON.parse(JSON.stringify(history[newIndex])), historyIndex: newIndex });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({ elements: JSON.parse(JSON.stringify(history[newIndex])), historyIndex: newIndex });
  },

  loadProject: (project, options) => {
    const elements = (project.elements ?? []).filter(
      (el: { type?: string }) => el.type !== 'freehand'
    ) as PosterElement[];
    return set((s) => ({
      elements,
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      canvasBackground: normalizeBackground(
        project.canvasBackground ?? (project.canvasBackgroundColor ? { type: 'solid', color: project.canvasBackgroundColor } : undefined)
      ),
      history: [JSON.parse(JSON.stringify(elements))],
      historyIndex: 0,
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 },
      fitCenterNonce: s.fitCenterNonce + 1,
      fieldBindings: options?.fieldBindings ?? null,
    }));
  },

  getProject: () => {
    const { elements, canvasWidth, canvasHeight, canvasBackground } = get();
    return { elements, canvasWidth, canvasHeight, canvasBackground };
  },

  getFieldBindings: () => get().fieldBindings,
}));
