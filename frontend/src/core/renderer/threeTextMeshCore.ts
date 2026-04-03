// AUTO-SPLIT from ThreeTextRenderer — mesh helpers
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { createMeshesFromMultiMaterialMesh } from 'three/addons/utils/SceneUtils.js';
import type { OpenTypeFont } from '../font/opentypeToThree';
import { generateShapesFromText } from '../font/opentypeToThree';
import {
  loadFrontTextures,
  loadFrontTexturesFromSet,
  blendMapWithIntensity,
  blendRoughnessMapWithIntensity,
} from '../textures/frontTextureCache';


const THREE_FONT_BASE =
  'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts';

/** Map editor fontFamily (CSS font name) to Three.js typeface filename. */
const FONT_FAMILY_TO_TYPEFACE: Record<string, string> = {
  'Arial Black, sans-serif': 'helvetiker_bold',
  'Impact, sans-serif': 'helvetiker_bold',
  'Franklin Gothic Medium, sans-serif': 'helvetiker_bold',
  'Verdana, sans-serif': 'helvetiker_regular',
  '"Trebuchet MS", sans-serif': 'helvetiker_regular',
  'Century Gothic, sans-serif': 'helvetiker_regular',
  'Georgia, serif': 'gentilis_regular',
  'Times New Roman, serif': 'gentilis_regular',
  'Palatino Linotype, Book Antiqua, serif': 'gentilis_regular',
  'Courier New, monospace': 'optimer_regular',
  'Brush Script MT, cursive': 'gentilis_regular',
  'Lucida Handwriting, cursive': 'gentilis_regular',
  'Segoe Script, cursive': 'gentilis_regular',
  'Bradley Hand, cursive': 'gentilis_regular',
  '"Great Vibes", cursive': 'gentilis_regular',
  '"Dancing Script", cursive': 'gentilis_regular',
  '"Allura", cursive': 'gentilis_regular',
  '"Sacramento", cursive': 'gentilis_regular',
  '"Satisfy", cursive': 'gentilis_regular',
  '"Pacifico", cursive': 'gentilis_regular',
  '"Tangerine", cursive': 'gentilis_regular',
};

function getTypefaceUrl(fontFamily: string): string {
  const name = FONT_FAMILY_TO_TYPEFACE[fontFamily] ?? 'helvetiker_regular';
  return `${THREE_FONT_BASE}/${name}.typeface.json`;
}
/** Environment map cache keyed by HDRI path. */
const envMapCache = new Map<string, THREE.Texture | null>();

export function loadEnvironmentMap(path: string): Promise<THREE.Texture | null> {
  if (!path) return Promise.resolve(null);
  const cached = envMapCache.get(path);
  if (cached !== undefined) return Promise.resolve(cached);

  const loader = new HDRLoader();
  return new Promise<THREE.Texture | null>((resolve) => {
    loader
      .loadAsync(path)
      .then((texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        envMapCache.set(path, texture);
        resolve(texture);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Bad File Format') && !msg.includes('reading')) {
          console.warn('[HDR] Load failed:', path, err);
        }
        envMapCache.set(path, null);
        resolve(null);
      });
  });
}

export interface ThreeTextRendererProps {
  content: string;
  fontFamily: string;
  fontSize: number;
  /** Extra horizontal space between glyphs in pixels (same units as font size in the UI). */
  letterSpacing?: number;
  frontColor: string;
  extrusionColor: string;
  metalness: number;
  roughness: number;
  bevelSize: number;
  bevelSegments?: number;
  bevelThickness?: number;
  curveSegments?: number;
  extrusionDepth: number;
  lightIntensity: number;
  /** Lighting: azimuth 0â€“360, elevation 0â€“90 */
  lightAzimuth: number;
  lightElevation: number;
  lightIntensityFromLighting: number;
  ambientIntensity: number;
  /** Lighting for extrusion (sides) only */
  extrusionLightAzimuth?: number;
  extrusionLightElevation?: number;
  extrusionLightAmbient?: number;
  /** Filters: 0â€“1, drive material and bevel */
  filtersShine: number;
  filtersMetallic: number;
  edgeRoundness: number;
  /** Shadow: 0 = off */
  shadowOpacity: number;
  /** Extrusion shear angle in degrees (-45 to 45). Shifts the back of the extrusion sideways so the sides are visible from the front. Positive = back shifts right. */
  extrusionAngle?: number;
  /** WebGL environment HDR path (e.g. /hdr/file.hdr). */
  environmentPath: string;
  /** When set > 0, front face uses MeshPhysicalMaterial with clearcoat. */
  frontClearcoat?: number;
  frontClearcoatRoughness?: number;
  frontMetalness?: number;
  frontRoughness?: number;
  frontEnvMapIntensity?: number;
  /** When true, extrusion is colorless/translucent and reflects environment (glossy glass). */
  extrusionGlass?: boolean;
  /** Front face texture: enabled. */
  frontTextureEnabled?: boolean;
  /** Front face texture preset id or custom URL. */
  frontTextureId?: string;
  /** User-uploaded front texture URL. Overrides frontTextureId when set. */
  customFrontTextureUrl?: string | null;
  /** PBR: roughness map URL (PNG/EXR). */
  customFrontTextureRoughnessUrl?: string | null;
  /** PBR: normal map URL (PNG/EXR). */
  customFrontTextureNormalUrl?: string | null;
  /** PBR: metalness map URL (PNG/EXR). */
  customFrontTextureMetalnessUrl?: string | null;
  /** Front normal strength multiplier (0â€“3). */
  frontNormalStrength?: number;
  /** Front texture visibility 0â€“1. */
  textureIntensity?: number;
  /** Roughness map strength 0â€“1 (front face). */
  textureRoughnessIntensity?: number;
  /** Front texture repeat U. */
  textureRepeatX?: number;
  /** Front texture repeat V. */
  textureRepeatY?: number;
  /** Inflate/pillow effect 0â€“1. Reduces depth and enlarges bevel to create a puffy dome shape. */
  inflate?: number;
  /** User-uploaded font (TTF/OTF parsed). When set, used instead of typeface for 3D text. */
  customFont?: OpenTypeFont | null;
  onReady?: (api: { toDataURL: (scale?: number) => string }) => void;
}

const fontCache = new Map<string, THREE.Font>();

export function loadFont(fontFamily: string): Promise<THREE.Font> {
  const url = getTypefaceUrl(fontFamily);
  const cached = fontCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const loader = new FontLoader();
    loader.load(
      url,
      (font) => {
        fontCache.set(url, font);
        resolve(font);
      },
      undefined,
      reject
    );
  });
}

const DEG2RAD = Math.PI / 180;

export const FRONT_NORMAL_SCALE = 0.35;

export function setTextureRepeat(tex: THREE.Texture, x: number, y: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(0.1, x), Math.max(0.1, y));
}

function typefaceGlyphAdvance(char: string, font: THREE.Font, textSize: number): number {
  const data = font.data;
  const scale = textSize / data.resolution;
  const g = data.glyphs[char] ?? data.glyphs['?'];
  if (!g) return 0;
  return (g.ha ?? 0) * scale;
}

function typefaceLineHeight(font: THREE.Font, textSize: number): number {
  const data = font.data;
  const bb = data.boundingBox;
  const scale = textSize / data.resolution;
  return (bb.yMax - bb.yMin + data.underlineThickness) * scale;
}

/**
 * Concatenate indexed extrude geometries while keeping material groups (unlike mergeGeometries(..., false), which drops groups).
 * Required so createMeshesFromMultiMaterialMesh can split front / sides / back.
 */
function mergeIndexedGeometriesPreservingGroups(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geoms.length === 0) return null;
  if (geoms.length === 1) return geoms[0];

  const names = Object.keys(geoms[0].attributes);
  const merged = new THREE.BufferGeometry();

  let vertexOffset = 0;
  let indexOffset = 0;
  const mergedIndex: number[] = [];
  const mergedGroups: THREE.BufferGeometry['groups'] = [];

  for (const g of geoms) {
    const idx = g.index;
    if (!idx) return null;
    if (g.groups.length === 0) return null;

    for (let i = 0; i < idx.count; i++) {
      mergedIndex.push(idx.getX(i) + vertexOffset);
    }
    for (const grp of g.groups) {
      mergedGroups.push({
        start: indexOffset + grp.start,
        count: grp.count,
        materialIndex: grp.materialIndex,
      });
    }
    vertexOffset += g.attributes.position.count;
    indexOffset += idx.count;
  }

  for (const name of names) {
    const first = geoms[0].attributes[name];
    const itemSize = first.itemSize;
    const totalVerts = geoms.reduce((s, g) => s + g.attributes.position.count, 0);
    const totalLength = totalVerts * itemSize;
    const ArrayCtor = first.array.constructor as new (n: number) => Float32Array;
    const mergedArr = new ArrayCtor(totalLength);
    let write = 0;
    for (const g of geoms) {
      const attr = g.attributes[name];
      mergedArr.set(attr.array as Float32Array, write);
      write += attr.array.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(mergedArr as unknown as ArrayBufferView, itemSize));
  }

  merged.setIndex(mergedIndex);
  merged.groups = mergedGroups;
  return merged;
}

/** Typeface.json text with optional per-glyph letter spacing and line breaks. */
function buildTypefaceTextGeometry(
  font: THREE.Font,
  content: string,
  opts: {
    size: number;
    depth: number;
    curveSegments: number;
    bevelThickness: number;
    bevelSize: number;
    bevelSegments: number;
    letterSpacing: number;
    fontSize: number;
  }
): THREE.BufferGeometry {
  const spacingWorld = (opts.letterSpacing * opts.size) / Math.max(1, opts.fontSize);
  const textParams = {
    font,
    size: opts.size,
    depth: opts.depth,
    curveSegments: opts.curveSegments,
    bevelEnabled: true,
    bevelThickness: opts.bevelThickness,
    bevelSize: opts.bevelSize,
    bevelSegments: opts.bevelSegments,
  };
  if (spacingWorld <= 1e-8 && !content.includes('\n')) {
    return new TextGeometry(content, textParams);
  }
  const chars = Array.from(content);
  const geoms: THREE.BufferGeometry[] = [];
  let penX = 0;
  let penY = 0;
  const lineHeight = typefaceLineHeight(font, opts.size);
  for (const ch of chars) {
    if (ch === '\n') {
      penX = 0;
      penY -= lineHeight;
      continue;
    }
    const g = new TextGeometry(ch, textParams);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    g.translate(penX - box.min.x, penY - box.min.y, 0);
    geoms.push(g);
    penX += typefaceGlyphAdvance(ch, font, opts.size) + spacingWorld;
  }
  if (geoms.length === 0) {
    return new TextGeometry(' ', textParams);
  }
  const merged = mergeIndexedGeometriesPreservingGroups(geoms);
  if (merged) {
    for (const g of geoms) g.dispose();
    return merged;
  }
  const fallback = geoms[0];
  for (let i = 1; i < geoms.length; i++) geoms[i].dispose();
  return fallback;
}

function ensureGeometryUVs(geometry: THREE.BufferGeometry): void {
  if (geometry.attributes.uv) return;
  const pos = geometry.attributes.position;
  if (!pos) return;
  const count = pos.count;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = new THREE.Vector3();
  box.getSize(size);
  const uv = new Float32Array(count * 2);
  const minX = box.min.x;
  const minY = box.min.y;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv[i * 2] = size.x > 0 ? (x - minX) / size.x : 0;
    uv[i * 2 + 1] = size.y > 0 ? (y - minY) / size.y : 0;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}


export type ThreeTextMeshLoadedTextures = {
  map?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
};

/** Build centered text mesh group (front / sides / back). Caller adds to scene and owns lights. */
export async function buildThreeTextMeshGroup(
  props: Omit<ThreeTextRendererProps, 'onReady'>,
  opts?: { signal?: AbortSignal }
): Promise<{ group: THREE.Group; loadedTextures: ThreeTextMeshLoadedTextures | null } | null> {
  const signal = opts?.signal;
  const {
    content,
    fontFamily,
    fontSize,
    letterSpacing = 0,
    frontColor,
    extrusionColor,
    metalness,
    roughness,
    bevelSize,
    bevelSegments = 5,
    bevelThickness = 0.2,
    curveSegments = 12,
    extrusionDepth,
    extrusionAngle = 0,
    filtersShine,
    filtersMetallic,
    edgeRoundness,
    frontClearcoat,
    frontClearcoatRoughness = 0.1,
    frontMetalness = 0.6,
    frontRoughness = 0.2,
    frontEnvMapIntensity = 2,
    extrusionGlass = false,
    frontTextureEnabled = false,
    frontTextureId = '',
    customFrontTextureUrl = null,
    customFrontTextureRoughnessUrl = null,
    customFrontTextureNormalUrl = null,
    customFrontTextureMetalnessUrl = null,
    frontNormalStrength = 1,
    textureIntensity = 1,
    textureRoughnessIntensity = 1,
    textureRepeatX = 2,
    textureRepeatY = 2,
    inflate = 0,
    customFont,
  } = props;

  if (!content.trim()) return null;

  const size = Math.max(0.1, fontSize * 0.012);
  const inf = Math.max(0, Math.min(1, inflate));
  const rawDepth = extrusionDepth * 0.5;
  const depth = inf > 0 ? Math.max(0.01, rawDepth * (1 - inf * 0.97)) : Math.max(0.01, rawDepth);
  const maxBevelSize = 0.35 + inf * 0.25;
  const effectiveBevelSize = Math.max(0.02, Math.min(maxBevelSize, bevelSize + edgeRoundness * 0.15 + inf * 0.1));
  const effectiveMetalness = Math.min(1, metalness * (0.3 + 0.7 * filtersMetallic));
  const effectiveRoughness = Math.max(0.05, Math.min(1, roughness * (1.2 - filtersShine * 0.5)));

  const useGlossyFront = frontClearcoat != null && frontClearcoat > 0;

  const sideMaterial = new THREE.MeshPhysicalMaterial(
    extrusionGlass
      ? {
          transparent: true,
          opacity: 0.45,
          color: 0xffffff,
          metalness: 1,
          roughness: 0.1,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          envMapIntensity: 2.5,
        }
      : {
          color: extrusionColor,
          metalness: effectiveMetalness,
          roughness: effectiveRoughness,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          envMapIntensity: 2,
        }
  );

  let geometry: THREE.BufferGeometry;
  if (customFont) {
    const scale = size / Math.max(1, fontSize);
    const shapes = generateShapesFromText(content, customFont, fontSize, {
      scale,
      flipY: (customFont.tables?.head?.yMax ?? 1024) * scale,
      letterSpacing,
    });
    if (shapes.length === 0) {
      sideMaterial.dispose();
      return null;
    }
    const customDepth = depth * 0.35;
    const customBevelSize = effectiveBevelSize * 0.5;
    const customNormalBT = Math.min(customDepth * 0.5, bevelThickness * 0.25);
    const customBevelThickness = inf > 0 ? customNormalBT + inf * size * 0.25 : customNormalBT;
    const customBevelSegments = Math.round(bevelSegments + inf * 20);
    geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: customDepth,
      bevelEnabled: true,
      bevelThickness: customBevelThickness,
      bevelSize: customBevelSize,
      bevelSegments: customBevelSegments,
      curveSegments,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  } else {
    const typefaceUrl = getTypefaceUrl(fontFamily);
    let font = fontCache.get(typefaceUrl);
    if (!font) font = fontCache.get(getTypefaceUrl('Arial Black, sans-serif'));
    if (!font) {
      sideMaterial.dispose();
      return null;
    }
    const normalBT = Math.min(rawDepth > 0 ? rawDepth * 0.3 : 0.1, bevelThickness);
    const effectiveBT = inf > 0 ? normalBT + inf * size * 0.35 : Math.min(depth * 0.6, bevelThickness);
    const effectiveBS = Math.round(bevelSegments + inf * 20);
    // Built-in typeface fonts use standard TextGeometry; WebGL letter spacing is only applied for custom (OTF/TTF) fonts.
    geometry = new TextGeometry(content, {
      font,
      size,
      depth,
      curveSegments,
      bevelEnabled: true,
      bevelThickness: effectiveBT,
      bevelSize: effectiveBevelSize,
      bevelSegments: effectiveBS,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }

  if (extrusionAngle !== 0) {
    const pos = geometry.attributes.position;
    const shearX = 0.5 * Math.tan(extrusionAngle * DEG2RAD);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setX(i, x + shearX * z);
    }
    pos.needsUpdate = true;
    geometry.computeBoundingBox();
    const boxAfter = geometry.boundingBox!;
    const centerAfter = new THREE.Vector3();
    boxAfter.getCenter(centerAfter);
    geometry.translate(-centerAfter.x, -centerAfter.y, -centerAfter.z);
  }

  ensureGeometryUVs(geometry);
  geometry.computeBoundingBox();

  return await (async () => {
    let loadedTexturesOut: ThreeTextMeshLoadedTextures | null = null;
    let frontMaterial: THREE.Material;
    const textureSource = customFrontTextureUrl || frontTextureId;
    const useTexture = frontTextureEnabled && !!textureSource;
    const usePbrSet =
      !!customFrontTextureUrl &&
      (!!customFrontTextureRoughnessUrl ||
        !!customFrontTextureNormalUrl ||
        !!customFrontTextureMetalnessUrl);
    if (useTexture) {
      const loaded = usePbrSet
        ? await loadFrontTexturesFromSet(
            customFrontTextureUrl!,
            customFrontTextureRoughnessUrl ?? undefined,
            customFrontTextureNormalUrl ?? undefined,
            customFrontTextureMetalnessUrl ?? undefined
          )
        : await loadFrontTextures(textureSource);
      if (signal?.aborted) {
        geometry.dispose();
        sideMaterial.dispose();
        return null;
      }
      if (loaded?.map) {
        loadedTexturesOut = {
          map: loaded.map,
          roughnessMap: loaded.roughnessMap,
          normalMap: loaded.normalMap,
          metalnessMap: loaded.metalnessMap,
        };
        const blendedMap = blendMapWithIntensity(loaded.map, Math.max(0, Math.min(1, textureIntensity)));
        setTextureRepeat(blendedMap, textureRepeatX, textureRepeatY);
        let roughnessMapForMat: THREE.Texture | undefined;
        if (loaded.roughnessMap) {
          const rInt = Math.max(0, Math.min(1, textureRoughnessIntensity ?? 1));
          roughnessMapForMat =
            rInt >= 0.998
              ? loaded.roughnessMap
              : (blendRoughnessMapWithIntensity(loaded.roughnessMap, rInt) as THREE.Texture);
          setTextureRepeat(roughnessMapForMat, textureRepeatX, textureRepeatY);
        }
        if (loaded.normalMap) {
          setTextureRepeat(loaded.normalMap, textureRepeatX, textureRepeatY);
        }
        if (loaded.metalnessMap) {
          setTextureRepeat(loaded.metalnessMap, textureRepeatX, textureRepeatY);
        }
        const baseMetalness = useGlossyFront ? (frontMetalness ?? 0.6) : 0;
        const baseRoughness = useGlossyFront ? (frontRoughness ?? 0.2) : 0.35;
        const effectiveFrontMetalness = loaded.metalnessMap ? 1 : baseMetalness;
        const effectiveFrontRoughness = roughnessMapForMat ? 1 : baseRoughness;

        const normalStrength = Math.max(0, Math.min(10, frontNormalStrength ?? 1));
        const normalScaleVal = (loaded.normalMap ? 1 : FRONT_NORMAL_SCALE) * normalStrength;
        const normalScaleVec = new THREE.Vector2(normalScaleVal, normalScaleVal);
        const basePhys: Record<string, unknown> = {
          color: frontColor,
          metalness: effectiveFrontMetalness,
          roughness: effectiveFrontRoughness,
          map: blendedMap,
          normalScale: normalScaleVec,
          ...(roughnessMapForMat ? { roughnessMap: roughnessMapForMat } : {}),
          ...(loaded.normalMap
            ? {
                normalMap: loaded.normalMap,
                normalMapType: THREE.TangentSpaceNormalMap,
              }
            : {}),
          ...(loaded.metalnessMap ? { metalnessMap: loaded.metalnessMap } : {}),
        };
        if (useGlossyFront) {
          basePhys.clearcoat = frontClearcoat ?? 1;
          basePhys.clearcoatRoughness = frontClearcoatRoughness ?? 0.1;
          basePhys.envMapIntensity = frontEnvMapIntensity ?? 2;
          if (loaded.normalMap) {
            basePhys.clearcoatNormalMap = loaded.normalMap;
            basePhys.clearcoatNormalScale = normalScaleVec.clone();
          }
        }
        frontMaterial = new THREE.MeshPhysicalMaterial(basePhys as THREE.MeshPhysicalMaterialParameters);
      } else {
        loadedTexturesOut = null;
        frontMaterial = useGlossyFront
          ? new THREE.MeshPhysicalMaterial({
              color: frontColor,
              metalness: frontMetalness ?? 0.6,
              roughness: frontRoughness ?? 0.2,
              clearcoat: frontClearcoat ?? 1,
              clearcoatRoughness: frontClearcoatRoughness ?? 0.1,
              envMapIntensity: frontEnvMapIntensity ?? 2,
            })
          : new THREE.MeshStandardMaterial({
              color: frontColor,
              metalness: 0,
              roughness: 0.35,
            });
      }
    } else {
      loadedTexturesOut = null;
      frontMaterial = useGlossyFront
        ? new THREE.MeshPhysicalMaterial({
            color: frontColor,
            metalness: frontMetalness ?? 0.6,
            roughness: frontRoughness ?? 0.2,
            clearcoat: frontClearcoat ?? 1,
            clearcoatRoughness: frontClearcoatRoughness ?? 0.1,
            envMapIntensity: frontEnvMapIntensity ?? 2,
          })
        : new THREE.MeshStandardMaterial({
            color: frontColor,
            metalness: 0,
            roughness: 0.35,
          });
    }

    if (signal?.aborted) {
      geometry.dispose();
      sideMaterial.dispose();
      return null;
    }
    const materials = [frontMaterial, sideMaterial, frontMaterial];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const meshGroup = createMeshesFromMultiMaterialMesh(mesh) as THREE.Group;
    geometry.dispose();
    // ExtrudeGeometry uses two draw groups (caps = material 0, sides = material 1), not three.
    if (meshGroup.children.length === 0) {
      sideMaterial.dispose();
      frontMaterial.dispose();
      return null;
    }
    meshGroup.children[0]?.layers.set(0);
    meshGroup.children[1]?.layers.set(1);
    if (meshGroup.children[2]) meshGroup.children[2].layers.set(0);

    meshGroup.children.forEach((child) => {
      const m = child as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
    });

    return { group: meshGroup, loadedTextures: loadedTexturesOut };
  })();
}
