export interface TextSettings {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
}

export interface ExtrusionSettings {
  depth: number;
  steps: number;
  /** Shine (metallic effect) on extrusion layers only; 0 = no metallic, 1 = full. */
  shine: number;
  /** Extrusion shear angle in degrees (-45 to 45). Shifts the back of the extrusion sideways so the sides are visible when viewed straight on. Positive = back shifts right. */
  angle?: number;
}

export interface LightingSettings {
  azimuth: number;
  elevation: number;
  intensity: number;
  ambient: number;
}

/** Lighting applied only to the extrusion (sides). Main lighting still affects front/back. */
export interface ExtrusionLightingSettings {
  azimuth: number;
  elevation: number;
  ambient: number;
}

export interface FilterSettings {
  shine: number;
  metallic: number;
  /** Edge roundness on the front face where it meets the extrusion; 0 = sharp, 1 = smooth. */
  edgeRoundness: number;
}

export interface GradientStop {
  offset: number;
  color: string;
}

export type GradientType = 'linear' | 'radial';

export interface HdriPreset {
  id: string;
  label: string;
  path: string;
}

export type EnvironmentId = string;

export interface EditorState {
  text: TextSettings;
  extrusion: ExtrusionSettings;
  lighting: LightingSettings;
  filters: FilterSettings;
  gradientStops?: GradientStop[];
  /** 'radial' = center-to-edge; default 'linear'. */
  gradientType?: GradientType;
  /** Override for extrusion. */
  extrusionGradientStops?: GradientStop[];
  /** feDropShadow: 0 = off. */
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** Shadow opacity (0–1). */
  shadowOpacity?: number;
  /** Radial highlight overlay: 0 = off, 1 = full. */
  reflectionStrength?: number;
  /** Linear gradient angle (degrees) - aligns with light when set. */
  gradientAngle?: number;
  /** Render engine: 'svg' (default) or 'webgl' for Three.js. */
  renderEngine?: 'svg' | 'webgl';
  /** WebGL environment: HDRI id. */
  environmentId?: EnvironmentId;
  /** WebGL environments loaded from backend. */
  hdrPresets?: HdriPreset[];
  /** WebGL preset: front face color (e.g. #ffffff). */
  frontColor?: string;
  /** WebGL preset: extrusion/sides color (e.g. #d4af37). */
  extrusionColor?: string;
  /** WebGL preset: metalness 0–1. */
  metalness?: number;
  /** WebGL preset: roughness 0–1. */
  roughness?: number;
  /** WebGL preset: bevel size. */
  bevelSize?: number;
  /** Bevel segment count (5 = stepped, 12 = smooth/round). */
  bevelSegments?: number;
  /** Bevel depth into extrusion (larger = more visible round edge). */
  bevelThickness?: number;
  /** Curve segments for font outline (higher = smoother extrusion walls). */
  curveSegments?: number;
  /** WebGL preset: extrusion depth (units). */
  extrusionDepth?: number;
  /** WebGL preset: directional light intensity. */
  lightIntensity?: number;
  /** WebGL preset: front face MeshPhysicalMaterial clearcoat (0–1). When set, front uses physical material with clearcoat. */
  frontClearcoat?: number;
  /** WebGL preset: front face clearcoat roughness (0–1). */
  frontClearcoatRoughness?: number;
  /** WebGL preset: front face metalness (0–1). */
  frontMetalness?: number;
  /** WebGL preset: front face roughness (0–1). */
  frontRoughness?: number;
  /** WebGL preset: front face envMapIntensity. */
  frontEnvMapIntensity?: number;
  /** Front face texture: enabled when true. */
  frontTextureEnabled?: boolean;
  /** Front face texture preset id: 'grain' | 'rough' | 'brushed' or '' for none. */
  frontTextureId?: string;
  /** Front face texture visibility 0–1. */
  textureIntensity?: number;
  /** Front face texture repeat (U). */
  textureRepeatX?: number;
  /** Front face texture repeat (V). */
  textureRepeatY?: number;
  /** User-uploaded front texture URL (object URL). When set, overrides frontTextureId. */
  customFrontTextureUrl?: string | null;
  /** PBR: roughness map URL (PNG/EXR). */
  customFrontTextureRoughnessUrl?: string | null;
  /** PBR: normal map URL (PNG/EXR). */
  customFrontTextureNormalUrl?: string | null;
  /** PBR: metalness map URL (PNG/EXR). */
  customFrontTextureMetalnessUrl?: string | null;
  /** PBR: displacement (height) map URL (PNG/EXR). */
  customFrontTextureDispUrl?: string | null;
  /** Front face normal strength multiplier (0–3). */
  frontNormalStrength?: number;
  /** Roughness map strength on front texture (0 = flat / ignore variation, 1 = full map). */
  textureRoughnessIntensity?: number;
  /** WebGL preset: extrusion is colorless/translucent and reflects environment (glossy glass look). */
  extrusionGlass?: boolean;
  /** Lighting for extrusion (sides) only. Azimuth, elevation, ambient. */
  extrusionLighting?: ExtrusionLightingSettings;
  /** IDs of user-uploaded fonts (for dropdown). */
  customFontIds?: string[];
  /** ID of user-uploaded font to use in WebGL. Null = use preset font. */
  selectedCustomFontId?: string | null;
}

export const DEFAULT_TEXT: TextSettings = {
  content: '3D Text',
  fontFamily: 'Arial Black, sans-serif',
  fontSize: 72,
  fontWeight: '900',
};

export const DEFAULT_EXTRUSION: ExtrusionSettings = {
  depth: 20,
  steps: 12,
  shine: 0.6,
  angle: 0,
};

export const DEFAULT_LIGHTING: LightingSettings = {
  azimuth: 45,
  elevation: 35,
  intensity: 1.2,
  ambient: 0.4,
};

export const DEFAULT_EXTRUSION_LIGHTING: ExtrusionLightingSettings = {
  azimuth: 270,
  elevation: 45,
  ambient: 0.35,
};

export const DEFAULT_FILTERS: FilterSettings = {
  shine: 0.8,
  metallic: 1,
  edgeRoundness: 0,
};
