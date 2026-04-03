import type { EditorPerLayerFields, EditorState, TextLayer3D, TextLayerTransform } from './types';

/** After any root field change, keep `textLayers[active]` aligned with root. */
export function syncLayersFromMerged(merged: EditorState): {
  textLayers: TextLayer3D[];
  activeTextLayerId: string | null;
} {
  const layers = merged.textLayers ?? [];
  if (!layers.length) {
    const id = newTextLayerId();
    return { textLayers: [textLayerFromRoot(merged, id)], activeTextLayerId: id };
  }
  const aid = merged.activeTextLayerId ?? layers[0].id;
  return {
    textLayers: layers.map((l) =>
      l.id === aid ? { ...l, ...textLayerContentFromRoot(merged) } : l
    ),
    activeTextLayerId: aid,
  };
}

const DEFAULT_TRANSFORM: TextLayerTransform = {
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  scale: 1,
};

export function newTextLayerId(): string {
  return crypto.randomUUID();
}

/** Per-layer content only (no id/transform). Read from editor root. */
export function textLayerContentFromRoot(s: EditorState): EditorPerLayerFields {
  return {
    text: s.text,
    extrusion: s.extrusion,
    filters: s.filters,
    gradientStops: s.gradientStops,
    gradientType: s.gradientType,
    extrusionGradientStops: s.extrusionGradientStops,
    gradientAngle: s.gradientAngle,
    shadowBlur: s.shadowBlur,
    shadowOffsetX: s.shadowOffsetX,
    shadowOffsetY: s.shadowOffsetY,
    shadowOpacity: s.shadowOpacity,
    reflectionStrength: s.reflectionStrength,
    frontColor: s.frontColor,
    extrusionColor: s.extrusionColor,
    metalness: s.metalness,
    roughness: s.roughness,
    bevelSize: s.bevelSize,
    bevelSegments: s.bevelSegments,
    bevelThickness: s.bevelThickness,
    curveSegments: s.curveSegments,
    extrusionDepth: s.extrusionDepth,
    frontClearcoat: s.frontClearcoat,
    frontClearcoatRoughness: s.frontClearcoatRoughness,
    frontMetalness: s.frontMetalness,
    frontRoughness: s.frontRoughness,
    frontEnvMapIntensity: s.frontEnvMapIntensity,
    frontTextureEnabled: s.frontTextureEnabled,
    frontTextureId: s.frontTextureId,
    textureIntensity: s.textureIntensity,
    textureRepeatX: s.textureRepeatX,
    textureRepeatY: s.textureRepeatY,
    customFrontTextureUrl: s.customFrontTextureUrl,
    customFrontTextureRoughnessUrl: s.customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl: s.customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl: s.customFrontTextureMetalnessUrl,
    customFrontTextureDispUrl: s.customFrontTextureDispUrl,
    frontNormalStrength: s.frontNormalStrength,
    textureRoughnessIntensity: s.textureRoughnessIntensity,
    extrusionGlass: s.extrusionGlass,
    inflate: s.inflate,
    selectedCustomFontId: s.selectedCustomFontId,
  };
}

/** Build one `TextLayer3D` from current root + id + optional transform override. */
export function textLayerFromRoot(
  s: EditorState,
  id: string,
  transform?: Partial<TextLayerTransform>
): TextLayer3D {
  const cur = s.textLayers?.find((l) => l.id === (s.activeTextLayerId ?? '')) ?? s.textLayers?.[0];
  const t: TextLayerTransform = {
    ...DEFAULT_TRANSFORM,
    positionX: cur?.positionX ?? 0,
    positionY: cur?.positionY ?? 0,
    positionZ: cur?.positionZ ?? 0,
    scale: cur?.scale ?? 1,
    ...transform,
  };
  return {
    id,
    ...t,
    ...textLayerContentFromRoot(s),
  };
}

/** Apply a stored layer onto root fields (active layer editing). */
export function rootFieldsFromTextLayer(layer: TextLayer3D): Partial<EditorState> {
  return {
    text: layer.text,
    extrusion: layer.extrusion,
    filters: layer.filters,
    gradientStops: layer.gradientStops,
    gradientType: layer.gradientType,
    extrusionGradientStops: layer.extrusionGradientStops,
    gradientAngle: layer.gradientAngle,
    shadowBlur: layer.shadowBlur,
    shadowOffsetX: layer.shadowOffsetX,
    shadowOffsetY: layer.shadowOffsetY,
    shadowOpacity: layer.shadowOpacity,
    reflectionStrength: layer.reflectionStrength,
    frontColor: layer.frontColor,
    extrusionColor: layer.extrusionColor,
    metalness: layer.metalness,
    roughness: layer.roughness,
    bevelSize: layer.bevelSize,
    bevelSegments: layer.bevelSegments,
    bevelThickness: layer.bevelThickness,
    curveSegments: layer.curveSegments,
    extrusionDepth: layer.extrusionDepth,
    frontClearcoat: layer.frontClearcoat,
    frontClearcoatRoughness: layer.frontClearcoatRoughness,
    frontMetalness: layer.frontMetalness,
    frontRoughness: layer.frontRoughness,
    frontEnvMapIntensity: layer.frontEnvMapIntensity,
    frontTextureEnabled: layer.frontTextureEnabled,
    frontTextureId: layer.frontTextureId,
    textureIntensity: layer.textureIntensity,
    textureRepeatX: layer.textureRepeatX,
    textureRepeatY: layer.textureRepeatY,
    customFrontTextureUrl: layer.customFrontTextureUrl,
    customFrontTextureRoughnessUrl: layer.customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl: layer.customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl: layer.customFrontTextureMetalnessUrl,
    customFrontTextureDispUrl: layer.customFrontTextureDispUrl,
    frontNormalStrength: layer.frontNormalStrength,
    textureRoughnessIntensity: layer.textureRoughnessIntensity,
    extrusionGlass: layer.extrusionGlass,
    inflate: layer.inflate,
    selectedCustomFontId: layer.selectedCustomFontId,
  };
}

/** Merge flat poster 3D config into a single layer and root (poster / modal). */
export function posterConfigToSingleLayerState(
  base: EditorState,
  config: Partial<EditorState>
): Partial<EditorState> {
  // New format: keep full multi-layer scene for poster edit fidelity.
  if (config.textLayers && config.textLayers.length > 0) {
    const layers = config.textLayers;
    const activeId = config.activeTextLayerId ?? layers[0].id;
    const activeLayer = layers.find((l) => l.id === activeId) ?? layers[0];
    const merged: EditorState = {
      ...base,
      ...config,
      textLayers: layers,
      activeTextLayerId: activeId,
    } as EditorState;
    return {
      ...merged,
      ...rootFieldsFromTextLayer(activeLayer),
      textLayers: layers,
      activeTextLayerId: activeId,
    };
  }

  // Backward compatibility: old poster config used flat single-layer fields.
  const merged: EditorState = { ...base, ...config } as EditorState;
  const id = newTextLayerId();
  const layer = textLayerFromRoot(merged, id);
  return {
    ...merged,
    ...rootFieldsFromTextLayer(layer),
    textLayers: [layer],
    activeTextLayerId: id,
  };
}
