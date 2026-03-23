import type { EditorState } from '../../core/types';
import { useEditorStore } from '../../store/editorStore';

/** Serialize EditorState for storage (3D text config). Blob/object URLs are stripped. */
export function serializeEditorState(): Partial<EditorState> {
  const s = useEditorStore.getState();
  const state: Record<string, unknown> = {};
  const keys: (keyof EditorState)[] = [
    'text', 'extrusion', 'lighting', 'extrusionLighting', 'filters',
    'gradientStops', 'gradientType', 'extrusionGradientStops',
    'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity',
    'reflectionStrength', 'gradientAngle', 'renderEngine', 'environmentId',
    'frontColor', 'extrusionColor', 'metalness', 'roughness',
    'bevelSize', 'bevelSegments', 'bevelThickness', 'curveSegments',
    'extrusionDepth', 'lightIntensity', 'frontClearcoat', 'frontClearcoatRoughness',
    'frontMetalness', 'frontRoughness', 'frontEnvMapIntensity',
    'frontTextureEnabled', 'frontTextureId', 'textureIntensity',
    'textureRepeatX', 'textureRepeatY', 'textureRoughnessIntensity',
    'frontNormalStrength', 'extrusionGlass', 'selectedCustomFontId',
  ];
  for (const k of keys) {
    const v = s[k as keyof EditorState];
    if (v === undefined) continue;
    // Skip blob URLs - they can't be serialized; user must re-upload
    if (typeof v === 'string' && v.startsWith('blob:')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if (Object.values(obj).some((x) => typeof x === 'string' && (x as string).startsWith('blob:')))
        continue;
    }
    state[k] = v;
  }
  return state as Partial<EditorState>;
}
