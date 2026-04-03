import { create } from 'zustand';
import type { EditorState, TextLayer3D, TextSettings, ExtrusionSettings, LightingSettings, FilterSettings, ExtrusionLightingSettings } from '../core/types';
import { MAX_TEXT_LAYERS } from '../core/types';
import {
  DEFAULT_EXTRUSION,
  DEFAULT_LIGHTING,
  DEFAULT_EXTRUSION_LIGHTING,
  DEFAULT_FILTERS,
} from '../core/types';
import {
  newTextLayerId,
  posterConfigToSingleLayerState,
  rootFieldsFromTextLayer,
  syncLayersFromMerged,
  textLayerContentFromRoot,
  textLayerFromRoot,
} from '../core/textLayerHelpers';

export type WebGLExportAPI = {
  toDataURL: (scale?: number) => string;
};

/** Single style: White Gold Extrusion (WebGL). Used as initial state and on reset. */
const WHITE_GOLD_STATE: Partial<EditorState> = {
  text: { content: 'Wish', fontFamily: '"Dancing Script", cursive', fontSize: 72, fontWeight: '400' },
  renderEngine: 'webgl',
  frontColor: '#ffffff',
  extrusionColor: '#d4af37',
  metalness: 1,
  roughness: 0.25,
  bevelSize: 0.15,
  extrusionDepth: 2,
  lightIntensity: 2,
  extrusion: { depth: 10, steps: 10, shine: 0.9, angle: 0 },
  lighting: { azimuth: 270, elevation: 45, intensity: 1.2, ambient: 0.35 },
  extrusionLighting: { azimuth: 270, elevation: 45, ambient: 0.35 },
  filters: { shine: 0, metallic: 0, edgeRoundness: 0 },
  gradientType: 'radial',
  gradientStops: [
    { offset: 0, color: '#ffffff' },
    { offset: 0.5, color: '#ffffff' },
    { offset: 0.65, color: '#fff4c2' },
    { offset: 0.8, color: '#f7c948' },
    { offset: 1, color: '#a87400' },
  ],
  extrusionGradientStops: [
    { offset: 0, color: '#fff4c2' },
    { offset: 0.3, color: '#f7c948' },
    { offset: 0.6, color: '#d4a017' },
    { offset: 1, color: '#a87400' },
  ],
  shadowBlur: 6,
  shadowOffsetX: 6,
  shadowOffsetY: 6,
  shadowOpacity: 0.3,
};

const INITIAL_LAYER_ID = newTextLayerId();

const BASE_FLAT: EditorState = {
  text: WHITE_GOLD_STATE.text!,
  extrusion: WHITE_GOLD_STATE.extrusion ?? DEFAULT_EXTRUSION,
  lighting: WHITE_GOLD_STATE.lighting ?? DEFAULT_LIGHTING,
  extrusionLighting: WHITE_GOLD_STATE.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING,
  filters: WHITE_GOLD_STATE.filters ?? DEFAULT_FILTERS,
  gradientStops: WHITE_GOLD_STATE.gradientStops,
  gradientType: WHITE_GOLD_STATE.gradientType,
  extrusionGradientStops: WHITE_GOLD_STATE.extrusionGradientStops,
  gradientAngle: WHITE_GOLD_STATE.gradientAngle,
  shadowBlur: WHITE_GOLD_STATE.shadowBlur,
  shadowOffsetX: WHITE_GOLD_STATE.shadowOffsetX,
  shadowOffsetY: WHITE_GOLD_STATE.shadowOffsetY,
  shadowOpacity: WHITE_GOLD_STATE.shadowOpacity,
  reflectionStrength: WHITE_GOLD_STATE.reflectionStrength,
  renderEngine: WHITE_GOLD_STATE.renderEngine ?? 'webgl',
  environmentId: 'studio',
  hdrPresets: undefined,
  frontColor: WHITE_GOLD_STATE.frontColor,
  extrusionColor: WHITE_GOLD_STATE.extrusionColor,
  metalness: WHITE_GOLD_STATE.metalness,
  roughness: WHITE_GOLD_STATE.roughness,
  bevelSize: WHITE_GOLD_STATE.bevelSize,
  extrusionDepth: WHITE_GOLD_STATE.extrusionDepth,
  lightIntensity: WHITE_GOLD_STATE.lightIntensity,
  inflate: 0,
  selectedCustomFontId: null,
};

const INITIAL_TEXT_LAYERS: TextLayer3D[] = [
  textLayerFromRoot(
    { ...BASE_FLAT, textLayers: undefined, activeTextLayerId: undefined },
    INITIAL_LAYER_ID
  ),
];

interface EditorStore extends EditorState {
  webglExportAPI: WebGLExportAPI | null;
  editorHistory: EditorState[];
  editorHistoryIndex: number;
  setText: (text: Partial<TextSettings>) => void;
  setExtrusion: (extrusion: Partial<ExtrusionSettings>) => void;
  setLighting: (lighting: Partial<LightingSettings>) => void;
  setExtrusionLighting: (extrusionLighting: Partial<ExtrusionLightingSettings>) => void;
  setFilters: (filters: Partial<FilterSettings>) => void;
  setState: (state: Partial<EditorState>) => void;
  setWebGLExportAPI: (api: WebGLExportAPI | null) => void;
  reset: () => void;
  addTextLayer: () => void;
  removeTextLayer: (id: string) => void;
  duplicateTextLayer: () => void;
  setActiveTextLayerId: (id: string) => void;
  updateActiveLayerTransform: (patch: Partial<Pick<TextLayer3D, 'positionX' | 'positionY' | 'positionZ' | 'scale'>>) => void;
  /** Update front / extrusion colors for the active layer (avoids preset `setState` material reset). */
  setLayerColors: (patch: Partial<Pick<EditorState, 'frontColor' | 'extrusionColor'>>) => void;
  /** Poster modal: replace with one layer from saved flat config. */
  loadPoster3DConfig: (config: Partial<EditorState>) => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 100;

function toHistoryEntry(state: EditorState): EditorState {
  return JSON.parse(
    JSON.stringify({
      text: state.text,
      extrusion: state.extrusion,
      lighting: state.lighting,
      extrusionLighting: state.extrusionLighting,
      filters: state.filters,
      gradientStops: state.gradientStops,
      gradientType: state.gradientType,
      extrusionGradientStops: state.extrusionGradientStops,
      gradientAngle: state.gradientAngle,
      shadowBlur: state.shadowBlur,
      shadowOffsetX: state.shadowOffsetX,
      shadowOffsetY: state.shadowOffsetY,
      shadowOpacity: state.shadowOpacity,
      reflectionStrength: state.reflectionStrength,
      renderEngine: state.renderEngine,
      environmentId: state.environmentId,
      hdrPresets: state.hdrPresets,
      frontColor: state.frontColor,
      extrusionColor: state.extrusionColor,
      metalness: state.metalness,
      roughness: state.roughness,
      bevelSize: state.bevelSize,
      bevelSegments: state.bevelSegments,
      bevelThickness: state.bevelThickness,
      curveSegments: state.curveSegments,
      extrusionDepth: state.extrusionDepth,
      lightIntensity: state.lightIntensity,
      frontClearcoat: state.frontClearcoat,
      frontClearcoatRoughness: state.frontClearcoatRoughness,
      frontMetalness: state.frontMetalness,
      frontRoughness: state.frontRoughness,
      frontEnvMapIntensity: state.frontEnvMapIntensity,
      frontTextureEnabled: state.frontTextureEnabled,
      frontTextureId: state.frontTextureId,
      textureIntensity: state.textureIntensity,
      textureRepeatX: state.textureRepeatX,
      textureRepeatY: state.textureRepeatY,
      customFrontTextureUrl: state.customFrontTextureUrl,
      customFrontTextureRoughnessUrl: state.customFrontTextureRoughnessUrl,
      customFrontTextureNormalUrl: state.customFrontTextureNormalUrl,
      customFrontTextureMetalnessUrl: state.customFrontTextureMetalnessUrl,
      customFrontTextureDispUrl: state.customFrontTextureDispUrl,
      frontNormalStrength: state.frontNormalStrength,
      textureRoughnessIntensity: state.textureRoughnessIntensity,
      extrusionGlass: state.extrusionGlass,
      inflate: state.inflate,
      customFontIds: state.customFontIds,
      selectedCustomFontId: state.selectedCustomFontId,
      textLayers: state.textLayers,
      activeTextLayerId: state.activeTextLayerId,
    })
  ) as EditorState;
}

function withHistory(state: EditorStore, patch: Partial<EditorStore>): Partial<EditorStore> {
  const nextState = { ...state, ...patch } as EditorStore;
  const prevSnapshot = toHistoryEntry(state);
  const nextSnapshot = toHistoryEntry(nextState);
  if (JSON.stringify(prevSnapshot) === JSON.stringify(nextSnapshot)) return patch;

  const base = state.editorHistory.slice(0, state.editorHistoryIndex + 1);
  const appended = [...base, nextSnapshot];
  const trimmed =
    appended.length > HISTORY_LIMIT ? appended.slice(appended.length - HISTORY_LIMIT) : appended;
  return {
    ...patch,
    editorHistory: trimmed,
    editorHistoryIndex: trimmed.length - 1,
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...BASE_FLAT,
  textLayers: INITIAL_TEXT_LAYERS,
  activeTextLayerId: INITIAL_LAYER_ID,
  editorHistory: [],
  editorHistoryIndex: 0,
  webglExportAPI: null,

  setText: (text) =>
    set((state) => {
      const nextText = { ...state.text, ...text };
      const merged = { ...state, text: nextText } as EditorState;
      return withHistory(state, { text: nextText, ...syncLayersFromMerged(merged) });
    }),

  setExtrusion: (extrusion) =>
    set((state) => {
      const nextEx = { ...state.extrusion, ...extrusion };
      const merged = { ...state, extrusion: nextEx } as EditorState;
      return withHistory(state, { extrusion: nextEx, ...syncLayersFromMerged(merged) });
    }),

  setLighting: (lighting) =>
    set((state) => {
      const next = { ...state.lighting, ...lighting };
      const merged = { ...state, lighting: next } as EditorState;
      return withHistory(state, { lighting: next, ...syncLayersFromMerged(merged) });
    }),

  setExtrusionLighting: (extrusionLighting) =>
    set((state) => {
      const next = { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...extrusionLighting };
      const merged = { ...state, extrusionLighting: next } as EditorState;
      return withHistory(state, { extrusionLighting: next, ...syncLayersFromMerged(merged) });
    }),

  setFilters: (filters) =>
    set((state) => {
      const next = { ...state.filters, ...filters };
      const merged = { ...state, filters: next } as EditorState;
      return withHistory(state, { filters: next, ...syncLayersFromMerged(merged) });
    }),

  setState: (newState) =>
    set((state) => {
      if (newState.textLayers !== undefined) {
        return withHistory(state, newState as Partial<EditorStore>);
      }
      const MATERIAL_DEFAULTS: Partial<EditorState> = {
        extrusionGlass: false,
        frontClearcoat: 0,
        frontClearcoatRoughness: 0.1,
        frontMetalness: undefined,
        frontRoughness: undefined,
        frontEnvMapIntensity: 1,
        frontTextureEnabled: false,
        frontTextureId: '',
        textureIntensity: 0.5,
        textureRepeatX: 2,
        textureRepeatY: 2,
        frontNormalStrength: 1,
        textureRoughnessIntensity: 1,
        bevelSegments: 5,
        bevelThickness: 0.2,
        curveSegments: 12,
        inflate: 0,
      };

      const isPreset = newState.frontColor !== undefined || newState.extrusionColor !== undefined;
      const base = isPreset ? { ...MATERIAL_DEFAULTS, ...newState } : newState;

      const out = {
        text: base.text ? { ...state.text, ...base.text } : state.text,
        extrusion: base.extrusion ? { ...state.extrusion, ...base.extrusion } : state.extrusion,
        lighting: base.lighting ? { ...state.lighting, ...base.lighting } : state.lighting,
        filters: base.filters ? { ...state.filters, ...base.filters } : state.filters,
        gradientStops: base.gradientStops ?? state.gradientStops,
        gradientType: base.gradientType ?? state.gradientType,
        extrusionGradientStops: base.extrusionGradientStops ?? state.extrusionGradientStops,
        gradientAngle: base.gradientAngle ?? state.gradientAngle,
        shadowBlur: base.shadowBlur ?? state.shadowBlur,
        shadowOffsetX: base.shadowOffsetX ?? state.shadowOffsetX,
        shadowOffsetY: base.shadowOffsetY ?? state.shadowOffsetY,
        shadowOpacity: base.shadowOpacity ?? state.shadowOpacity,
        reflectionStrength: base.reflectionStrength ?? state.reflectionStrength,
        renderEngine: base.renderEngine ?? state.renderEngine,
        environmentId: base.environmentId ?? state.environmentId,
        hdrPresets: base.hdrPresets ?? state.hdrPresets,
        frontColor: base.frontColor ?? state.frontColor,
        extrusionColor: base.extrusionColor ?? state.extrusionColor,
        metalness: base.metalness ?? state.metalness,
        roughness: base.roughness ?? state.roughness,
        bevelSize: base.bevelSize ?? state.bevelSize,
        bevelSegments: base.bevelSegments ?? state.bevelSegments,
        bevelThickness: base.bevelThickness ?? state.bevelThickness,
        curveSegments: base.curveSegments ?? state.curveSegments,
        extrusionDepth: base.extrusionDepth ?? state.extrusionDepth,
        lightIntensity: base.lightIntensity ?? state.lightIntensity,
        extrusionGlass: base.extrusionGlass !== undefined ? base.extrusionGlass : state.extrusionGlass,
        frontClearcoat: base.frontClearcoat !== undefined ? base.frontClearcoat : state.frontClearcoat,
        frontClearcoatRoughness:
          base.frontClearcoatRoughness !== undefined ? base.frontClearcoatRoughness : state.frontClearcoatRoughness,
        frontMetalness: base.frontMetalness !== undefined ? base.frontMetalness : state.frontMetalness,
        frontRoughness: base.frontRoughness !== undefined ? base.frontRoughness : state.frontRoughness,
        frontEnvMapIntensity:
          base.frontEnvMapIntensity !== undefined ? base.frontEnvMapIntensity : state.frontEnvMapIntensity,
        frontTextureEnabled: base.frontTextureEnabled !== undefined ? base.frontTextureEnabled : state.frontTextureEnabled,
        frontTextureId: base.frontTextureId !== undefined ? base.frontTextureId : state.frontTextureId,
        textureIntensity: base.textureIntensity !== undefined ? base.textureIntensity : state.textureIntensity,
        textureRepeatX: base.textureRepeatX !== undefined ? base.textureRepeatX : state.textureRepeatX,
        textureRepeatY: base.textureRepeatY !== undefined ? base.textureRepeatY : state.textureRepeatY,
        customFrontTextureUrl: base.customFrontTextureUrl !== undefined ? base.customFrontTextureUrl : state.customFrontTextureUrl,
        customFrontTextureRoughnessUrl:
          base.customFrontTextureRoughnessUrl !== undefined
            ? base.customFrontTextureRoughnessUrl
            : state.customFrontTextureRoughnessUrl,
        customFrontTextureNormalUrl:
          base.customFrontTextureNormalUrl !== undefined ? base.customFrontTextureNormalUrl : state.customFrontTextureNormalUrl,
        customFrontTextureMetalnessUrl:
          base.customFrontTextureMetalnessUrl !== undefined
            ? base.customFrontTextureMetalnessUrl
            : state.customFrontTextureMetalnessUrl,
        customFrontTextureDispUrl:
          base.customFrontTextureDispUrl !== undefined ? base.customFrontTextureDispUrl : state.customFrontTextureDispUrl,
        frontNormalStrength: base.frontNormalStrength !== undefined ? base.frontNormalStrength : state.frontNormalStrength,
        textureRoughnessIntensity:
          base.textureRoughnessIntensity !== undefined
            ? base.textureRoughnessIntensity
            : state.textureRoughnessIntensity,
        extrusionLighting: base.extrusionLighting
          ? { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...base.extrusionLighting }
          : state.extrusionLighting,
        inflate: base.inflate !== undefined ? base.inflate : state.inflate,
        customFontIds: base.customFontIds ?? state.customFontIds,
        selectedCustomFontId:
          base.selectedCustomFontId !== undefined ? base.selectedCustomFontId : state.selectedCustomFontId,
      };

      const merged = { ...state, ...out } as EditorState;
      return withHistory(state, { ...out, ...syncLayersFromMerged(merged) });
    }),

  setWebGLExportAPI: (api) => set({ webglExportAPI: api }),

  loadPoster3DConfig: (config) =>
    set((state) => {
      const patch = {
        ...posterConfigToSingleLayerState(state as EditorState, config),
        webglExportAPI: null,
      } as Partial<EditorStore>;
      const nextState = { ...state, ...patch } as EditorStore;
      const snapshot = toHistoryEntry(nextState);
      return {
        ...patch,
        editorHistory: [snapshot],
        editorHistoryIndex: 0,
      };
    }),

  addTextLayer: () =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length >= MAX_TEXT_LAYERS) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers.map((l) =>
        l.id === aid ? { ...l, ...textLayerContentFromRoot(state as EditorState) } : l
      );
      const activeLayer = synced.find((l) => l.id === aid)!;
      const newId = newTextLayerId();
      const dup: TextLayer3D = {
        ...activeLayer,
        id: newId,
        positionZ: activeLayer.positionZ + 0.2,
        scale: activeLayer.scale,
      };
      return withHistory(state, {
        textLayers: [...synced, dup],
        activeTextLayerId: newId,
        ...rootFieldsFromTextLayer(dup),
      });
    }),

  duplicateTextLayer: () =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length >= MAX_TEXT_LAYERS) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers.map((l) =>
        l.id === aid ? { ...l, ...textLayerContentFromRoot(state as EditorState) } : l
      );
      const activeLayer = synced.find((l) => l.id === aid)!;
      const newId = newTextLayerId();
      const dup: TextLayer3D = {
        ...activeLayer,
        id: newId,
        positionX: activeLayer.positionX + 0.3,
        positionZ: activeLayer.positionZ + 0.15,
      };
      return withHistory(state, {
        textLayers: [...synced, dup],
        activeTextLayerId: newId,
        ...rootFieldsFromTextLayer(dup),
      });
    }),

  removeTextLayer: (id) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length <= 1) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers.map((l) =>
        l.id === aid ? { ...l, ...textLayerContentFromRoot(state as EditorState) } : l
      );
      const filtered = synced.filter((l) => l.id !== id);
      if (filtered.length === 0) return {};
      const newActive = filtered[0].id;
      return withHistory(state, {
        textLayers: filtered,
        activeTextLayerId: newActive,
        ...rootFieldsFromTextLayer(filtered[0]),
      });
    }),

  setActiveTextLayerId: (id) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (!layers.length) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers.map((l) =>
        l.id === aid ? { ...l, ...textLayerContentFromRoot(state as EditorState) } : l
      );
      const target = synced.find((l) => l.id === id);
      if (!target) return withHistory(state, { textLayers: synced });
      return withHistory(state, {
        textLayers: synced,
        activeTextLayerId: id,
        ...rootFieldsFromTextLayer(target),
      });
    }),

  updateActiveLayerTransform: (patch) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      const aid = state.activeTextLayerId ?? layers[0]?.id;
      if (!aid) return {};
      const next = layers.map((l) => (l.id === aid ? { ...l, ...patch } : l));
      return withHistory(state, { textLayers: next });
    }),

  setLayerColors: (patch) =>
    set((state) => {
      if (patch.frontColor === undefined && patch.extrusionColor === undefined) return {};
      const frontColor = patch.frontColor !== undefined ? patch.frontColor : state.frontColor;
      const extrusionColor = patch.extrusionColor !== undefined ? patch.extrusionColor : state.extrusionColor;
      const merged = { ...state, frontColor, extrusionColor } as EditorState;
      return withHistory(state, {
        frontColor,
        extrusionColor,
        ...syncLayersFromMerged(merged),
      });
    }),

  reset: () =>
    set((s) => {
      const lid = newTextLayerId();
      const nextFlat = {
        ...WHITE_GOLD_STATE,
        text: WHITE_GOLD_STATE.text!,
        extrusion: WHITE_GOLD_STATE.extrusion ?? DEFAULT_EXTRUSION,
        lighting: WHITE_GOLD_STATE.lighting ?? DEFAULT_LIGHTING,
        extrusionLighting: WHITE_GOLD_STATE.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING,
        filters: WHITE_GOLD_STATE.filters ?? DEFAULT_FILTERS,
        environmentId: s.environmentId,
        hdrPresets: s.hdrPresets,
        customFontIds: s.customFontIds ?? [],
        selectedCustomFontId: null,
        inflate: 0,
        renderEngine: WHITE_GOLD_STATE.renderEngine ?? 'webgl',
      };
      const mergedFlat = { ...s, ...nextFlat, textLayers: [], activeTextLayerId: null } as EditorState;
      const layer = textLayerFromRoot(mergedFlat, lid);
      const patch = {
        ...nextFlat,
        ...rootFieldsFromTextLayer(layer),
        textLayers: [layer],
        activeTextLayerId: lid,
        webglExportAPI: null,
      } as Partial<EditorStore>;
      const nextState = { ...s, ...patch } as EditorStore;
      const snapshot = toHistoryEntry(nextState);
      return {
        ...patch,
        editorHistory: [snapshot],
        editorHistoryIndex: 0,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.editorHistoryIndex <= 0) return {};
      const idx = state.editorHistoryIndex - 1;
      const entry = state.editorHistory[idx];
      return {
        ...entry,
        editorHistoryIndex: idx,
        webglExportAPI: state.webglExportAPI,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.editorHistoryIndex >= state.editorHistory.length - 1) return {};
      const idx = state.editorHistoryIndex + 1;
      const entry = state.editorHistory[idx];
      return {
        ...entry,
        editorHistoryIndex: idx,
        webglExportAPI: state.webglExportAPI,
      };
    }),
}));

{
  const s = useEditorStore.getState();
  const initial = toHistoryEntry(s);
  useEditorStore.setState({ editorHistory: [initial], editorHistoryIndex: 0 });
}
