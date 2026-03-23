import { create } from 'zustand';
import type { EditorState, TextSettings, ExtrusionSettings, LightingSettings, FilterSettings, ExtrusionLightingSettings } from '../core/types';
import {
  DEFAULT_EXTRUSION,
  DEFAULT_LIGHTING,
  DEFAULT_EXTRUSION_LIGHTING,
  DEFAULT_FILTERS,
} from '../core/types';

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

interface EditorStore extends EditorState {
  /** Set by ThreeTextRenderer when mounted; used for PNG export when renderEngine is webgl. */
  webglExportAPI: WebGLExportAPI | null;
  setText: (text: Partial<TextSettings>) => void;
  setExtrusion: (extrusion: Partial<ExtrusionSettings>) => void;
  setLighting: (lighting: Partial<LightingSettings>) => void;
  setExtrusionLighting: (extrusionLighting: Partial<ExtrusionLightingSettings>) => void;
  setFilters: (filters: Partial<FilterSettings>) => void;
  setState: (state: Partial<EditorState>) => void;
  setWebGLExportAPI: (api: WebGLExportAPI | null) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
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
  selectedCustomFontId: null,
  webglExportAPI: null,

  setText: (text) =>
    set((state) => ({ text: { ...state.text, ...text } })),

  setExtrusion: (extrusion) =>
    set((state) => ({ extrusion: { ...state.extrusion, ...extrusion } })),

  setLighting: (lighting) =>
    set((state) => ({ lighting: { ...state.lighting, ...lighting } })),

  setExtrusionLighting: (extrusionLighting) =>
    set((state) => ({ extrusionLighting: { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...extrusionLighting } })),

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  setState: (newState) =>
    set((state) => {
      // When a preset is applied it defines some material properties and omits others.
      // Properties it doesn't mention must reset to safe defaults so the previous
      // preset's values don't bleed through (e.g. Black Glossy Gold's clearcoat
      // sticking around after switching to White Gold Extrusion).
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
      };

      // Detect preset application: newState has rendering-visible keys like frontColor, extrusion, etc.
      const isPreset = newState.frontColor !== undefined || newState.extrusionColor !== undefined;

      // If this looks like a preset (not a single-slider tweak), reset material props first.
      const base = isPreset ? { ...MATERIAL_DEFAULTS, ...newState } : newState;

      return {
        text: base.text ? { ...state.text, ...base.text } : state.text,
        extrusion: base.extrusion
          ? { ...state.extrusion, ...base.extrusion }
          : state.extrusion,
        lighting: base.lighting
          ? { ...state.lighting, ...base.lighting }
          : state.lighting,
        filters: base.filters
          ? { ...state.filters, ...base.filters }
          : state.filters,
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
        frontClearcoatRoughness: base.frontClearcoatRoughness !== undefined ? base.frontClearcoatRoughness : state.frontClearcoatRoughness,
        frontMetalness: base.frontMetalness !== undefined ? base.frontMetalness : state.frontMetalness,
        frontRoughness: base.frontRoughness !== undefined ? base.frontRoughness : state.frontRoughness,
        frontEnvMapIntensity: base.frontEnvMapIntensity !== undefined ? base.frontEnvMapIntensity : state.frontEnvMapIntensity,
        frontTextureEnabled: base.frontTextureEnabled !== undefined ? base.frontTextureEnabled : state.frontTextureEnabled,
        frontTextureId: base.frontTextureId !== undefined ? base.frontTextureId : state.frontTextureId,
        textureIntensity: base.textureIntensity !== undefined ? base.textureIntensity : state.textureIntensity,
        textureRepeatX: base.textureRepeatX !== undefined ? base.textureRepeatX : state.textureRepeatX,
        textureRepeatY: base.textureRepeatY !== undefined ? base.textureRepeatY : state.textureRepeatY,
        customFrontTextureUrl: base.customFrontTextureUrl !== undefined ? base.customFrontTextureUrl : state.customFrontTextureUrl,
        customFrontTextureRoughnessUrl: base.customFrontTextureRoughnessUrl !== undefined ? base.customFrontTextureRoughnessUrl : state.customFrontTextureRoughnessUrl,
        customFrontTextureNormalUrl: base.customFrontTextureNormalUrl !== undefined ? base.customFrontTextureNormalUrl : state.customFrontTextureNormalUrl,
        customFrontTextureMetalnessUrl: base.customFrontTextureMetalnessUrl !== undefined ? base.customFrontTextureMetalnessUrl : state.customFrontTextureMetalnessUrl,
        customFrontTextureDispUrl: base.customFrontTextureDispUrl !== undefined ? base.customFrontTextureDispUrl : state.customFrontTextureDispUrl,
        frontNormalStrength: base.frontNormalStrength !== undefined ? base.frontNormalStrength : state.frontNormalStrength,
        textureRoughnessIntensity:
          base.textureRoughnessIntensity !== undefined
            ? base.textureRoughnessIntensity
            : state.textureRoughnessIntensity,
        extrusionLighting: base.extrusionLighting
          ? { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...base.extrusionLighting }
          : state.extrusionLighting,
        customFontIds: base.customFontIds ?? state.customFontIds,
        selectedCustomFontId: base.selectedCustomFontId !== undefined ? base.selectedCustomFontId : state.selectedCustomFontId,
      };
    }),

  setWebGLExportAPI: (api) => set({ webglExportAPI: api }),

  reset: () =>
    set((s) => ({
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
      webglExportAPI: null,
    })),
}));
