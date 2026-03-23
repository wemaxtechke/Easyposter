import {
  useEffect,
  useRef,
  useCallback,
  memo,
  useState,
} from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

function loadEnvironmentMap(path: string): Promise<THREE.Texture | null> {
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
  /** Lighting: azimuth 0–360, elevation 0–90 */
  lightAzimuth: number;
  lightElevation: number;
  lightIntensityFromLighting: number;
  ambientIntensity: number;
  /** Lighting for extrusion (sides) only */
  extrusionLightAzimuth?: number;
  extrusionLightElevation?: number;
  extrusionLightAmbient?: number;
  /** Filters: 0–1, drive material and bevel */
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
  /** Front normal strength multiplier (0–3). */
  frontNormalStrength?: number;
  /** Front texture visibility 0–1. */
  textureIntensity?: number;
  /** Roughness map strength 0–1 (front face). */
  textureRoughnessIntensity?: number;
  /** Front texture repeat U. */
  textureRepeatX?: number;
  /** Front texture repeat V. */
  textureRepeatY?: number;
  /** User-uploaded font (TTF/OTF parsed). When set, used instead of typeface for 3D text. */
  customFont?: OpenTypeFont | null;
  onReady?: (api: { toDataURL: (scale?: number) => string }) => void;
}

const fontCache = new Map<string, THREE.Font>();

function loadFont(fontFamily: string): Promise<THREE.Font> {
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

const FRONT_NORMAL_SCALE = 0.35;

function setTextureRepeat(tex: THREE.Texture, x: number, y: number): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(0.1, x), Math.max(0.1, y));
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

export const ThreeTextRenderer = memo(function ThreeTextRenderer({
  content,
  fontFamily,
  fontSize,
  frontColor,
  extrusionColor,
  metalness,
  roughness,
  bevelSize,
  bevelSegments = 5,
  bevelThickness = 0.2,
  curveSegments = 12,
  extrusionDepth,
  lightIntensity,
  lightAzimuth,
  lightElevation,
  lightIntensityFromLighting,
  ambientIntensity,
  extrusionLightAzimuth = 270,
  extrusionLightElevation = 45,
  extrusionLightAmbient = 0.35,
  filtersShine,
  filtersMetallic,
  edgeRoundness,
  shadowOpacity,
  extrusionAngle = 0,
  environmentPath,
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
  customFont,
  onReady,
}: ThreeTextRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const extrusionDirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const extrusionAmbientRef = useRef<THREE.AmbientLight | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number>(0);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  /** Persist orbit across scene rebuilds (e.g. edge roundness / texture changes). */
  const orbitStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  /** Raw loaded textures for in-place material updates (avoids re-fetch). */
  const loadedTexturesRef = useRef<{
    map?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
  } | null>(null);
  const [fontLoaded, setFontLoaded] = useState(false);

  const size = Math.max(0.1, fontSize * 0.012);
  const depth = Math.max(0.1, extrusionDepth * 0.5);
  const effectiveBevelSize = Math.max(0.02, Math.min(0.35, bevelSize + edgeRoundness * 0.15));
  const effectiveMetalness = Math.min(1, metalness * (0.3 + 0.7 * filtersMetallic));
  const effectiveRoughness = Math.max(0.05, Math.min(1, roughness * (1.2 - filtersShine * 0.5)));

  useEffect(() => {
    setFontLoaded(false);
    loadFont(fontFamily)
      .then(() => setFontLoaded(true))
      .catch(() => {
        loadFont('Arial Black, sans-serif').finally(() => setFontLoaded(true));
      });
  }, [fontFamily]);

  const dispose = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }
    if (meshGroupRef.current) {
      const group = meshGroupRef.current;
      group.children.forEach((child) => {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else if (m.material) m.material.dispose();
      });
      meshGroupRef.current = null;
    }
    extrusionDirLightRef.current = null;
    extrusionAmbientRef.current = null;
    if (sceneRef.current && meshGroupRef.current === null) {
      const scene = sceneRef.current;
      while (scene.children.length > 0) {
        const obj = scene.children[0];
        scene.remove(obj);
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      }
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    sceneRef.current = null;
    cameraRef.current = null;
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    loadEnvironmentMap(environmentPath)
      .then((envMap) => {
        if (sceneRef.current) {
          sceneRef.current.environment = envMap ?? null;
        }
      })
      .catch(() => {
        if (sceneRef.current) sceneRef.current.environment = null;
      });
  }, [environmentPath]);

  useEffect(() => {
    const useCustomFont = !!customFont;
    if (useCustomFont) {
      if (!containerRef.current || !content.trim()) return;
    } else {
      if (!fontLoaded || !containerRef.current || !content.trim()) return;
    }

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    loadEnvironmentMap(environmentPath)
      .then((envMap) => {
        if (envMap && sceneRef.current) sceneRef.current.environment = envMap;
      })
      .catch(() => {
        if (sceneRef.current) sceneRef.current.environment = null;
      });

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 20;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    controls.target.set(0, 0, 0);
    if (orbitStateRef.current) {
      camera.position.copy(orbitStateRef.current.position);
      controls.target.copy(orbitStateRef.current.target);
      camera.lookAt(controls.target);
    }
    controls.update();
    controlsRef.current = controls;

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
      });
      if (shapes.length === 0) return;
      const customDepth = depth * 0.35;
      const customBevelSize = effectiveBevelSize * 0.5;
      const customBevelThickness = Math.min(customDepth * 0.5, bevelThickness * 0.25);
      geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: customDepth,
        bevelEnabled: true,
        bevelThickness: customBevelThickness,
        bevelSize: customBevelSize,
        bevelSegments,
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
      if (!font) return;
      geometry = new TextGeometry(content, {
        font,
        size,
        depth,
        curveSegments,
        bevelEnabled: true,
        bevelThickness: Math.min(depth * 0.6, bevelThickness),
        bevelSize: effectiveBevelSize,
        bevelSegments,
      });
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const center = new THREE.Vector3();
      box.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
    }

    // Shear extrusion sideways so the back shifts and sides are visible when viewed straight on
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

    let cancelled = false;
    (async () => {
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
              customFrontTextureUrl,
              customFrontTextureRoughnessUrl ?? undefined,
              customFrontTextureNormalUrl ?? undefined,
              customFrontTextureMetalnessUrl ?? undefined
            )
          : await loadFrontTextures(textureSource);
        if (cancelled) {
          geometry.dispose();
          sideMaterial.dispose();
          return;
        }
        if (loaded) {
        loadedTexturesRef.current = {
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
        // In three.js, *Map values multiply the scalar. Use 1.0 so maps drive the final value.
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
        loadedTexturesRef.current = null;
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
      loadedTexturesRef.current = null;
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

      if (cancelled) {
        geometry.dispose();
        sideMaterial.dispose();
        return;
      }
      const materials = [frontMaterial, sideMaterial, frontMaterial];
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const meshGroup = createMeshesFromMultiMaterialMesh(mesh) as THREE.Group;
      geometry.dispose();
      meshGroup.children[0].layers.set(0);
      meshGroup.children[1].layers.set(1);
      if (meshGroup.children[2]) meshGroup.children[2].layers.set(0);
      meshGroup.children.forEach((child) => {
        const m = child as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      });
      scene.add(meshGroup);
      meshGroupRef.current = meshGroup;

      camera.layers.enable(1);

      const keyIntensity = 3 * lightIntensity * lightIntensityFromLighting;
      const radius = 15;
      const el = lightElevation * DEG2RAD;
      const az = lightAzimuth * DEG2RAD;
      const dirLight = new THREE.DirectionalLight(0xffffff, keyIntensity);
      dirLight.layers.set(0);
      dirLight.position.set(
        radius * Math.cos(el) * Math.cos(az),
        radius * Math.sin(el),
        radius * Math.cos(el) * Math.sin(az)
      );
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 50;
      dirLight.shadow.camera.left = -15;
      dirLight.shadow.camera.right = 15;
      dirLight.shadow.camera.top = 15;
      dirLight.shadow.camera.bottom = -15;
      dirLight.shadow.bias = -0.0001;
      scene.add(dirLight);
      dirLightRef.current = dirLight;

      const rimLight = new THREE.DirectionalLight(0xffffff, 2);
      rimLight.layers.set(0);
      rimLight.position.set(-5, 5, -5);
      scene.add(rimLight);

      const ambient = new THREE.AmbientLight(0xffffff, Math.max(0.4, ambientIntensity));
      ambient.layers.set(0);
      scene.add(ambient);
      ambientLightRef.current = ambient;

      const extrusionRadius = 15;
      const extrusionEl = extrusionLightElevation * DEG2RAD;
      const extrusionAz = extrusionLightAzimuth * DEG2RAD;
      const extrusionDirLight = new THREE.DirectionalLight(0xffffff, 2.5);
      extrusionDirLight.layers.set(1);
      extrusionDirLight.position.set(
        extrusionRadius * Math.cos(extrusionEl) * Math.cos(extrusionAz),
        extrusionRadius * Math.sin(extrusionEl),
        extrusionRadius * Math.cos(extrusionEl) * Math.sin(extrusionAz)
      );
      scene.add(extrusionDirLight);
      extrusionDirLightRef.current = extrusionDirLight;

      const extrusionAmbient = new THREE.AmbientLight(0xffffff, Math.max(0.3, extrusionLightAmbient));
      extrusionAmbient.layers.set(1);
      scene.add(extrusionAmbient);
      extrusionAmbientRef.current = extrusionAmbient;

      onReady?.({
        toDataURL: (scale?: number) => {
          const r = rendererRef.current;
          if (!r) return '';
          if (!scale || scale <= 1) {
            r.render(scene, camera);
            return r.domElement.toDataURL('image/png');
          }
          const prevSize = r.getSize(new THREE.Vector2());
          const prevRatio = r.getPixelRatio();
          const hiW = Math.round(prevSize.x * scale);
          const hiH = Math.round(prevSize.y * scale);
          r.setPixelRatio(1);
          r.setSize(hiW, hiH, false);
          camera.updateProjectionMatrix();
          r.render(scene, camera);
          const dataUrl = r.domElement.toDataURL('image/png');
          r.setPixelRatio(prevRatio);
          r.setSize(prevSize.x, prevSize.y, false);
          camera.updateProjectionMatrix();
          return dataUrl;
        },
      });

      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          if (controlsRef.current) {
            controlsRef.current.update();
          }
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      animate();

    const onResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 400;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    };
    resizeHandlerRef.current = onResize;
    window.addEventListener('resize', onResize);
    })();

    return () => {
      cancelled = true;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (cam && ctrl) {
        if (!orbitStateRef.current) {
          orbitStateRef.current = {
            position: new THREE.Vector3(),
            target: new THREE.Vector3(),
          };
        }
        orbitStateRef.current.position.copy(cam.position);
        orbitStateRef.current.target.copy(ctrl.target);
      }
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
      if (sceneRef.current) {
        if (extrusionDirLightRef.current) sceneRef.current.remove(extrusionDirLightRef.current);
        if (extrusionAmbientRef.current) sceneRef.current.remove(extrusionAmbientRef.current);
      }
      dirLightRef.current = null;
      ambientLightRef.current = null;
      extrusionDirLightRef.current = null;
      extrusionAmbientRef.current = null;
      dispose();
    };
  }, [
    fontLoaded,
    fontFamily,
    content,
    fontSize,
    size,
    depth,
    effectiveBevelSize,
    bevelSegments,
    bevelThickness,
    curveSegments,
    frontColor,
    extrusionColor,
    extrusionAngle,
    frontClearcoat,
    frontClearcoatRoughness,
    frontMetalness,
    frontRoughness,
    frontEnvMapIntensity,
    extrusionGlass,
    frontTextureEnabled,
    frontTextureId,
    customFrontTextureUrl,
    customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl,
    customFont,
    onReady,
    dispose,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- texture tuning params updated in-place below
  ]);

  // --- In-place material parameter updates (no scene rebuild) ---
  // GPU-only params (repeat, normalStrength) apply instantly.
  useEffect(() => {
    const group = meshGroupRef.current;
    if (!group) return;
    const loaded = loadedTexturesRef.current;
    if (!loaded?.map) return;
    const frontMesh = group.children[0] as THREE.Mesh | undefined;
    if (!frontMesh) return;
    const mat = frontMesh.material as THREE.MeshPhysicalMaterial | undefined;
    if (!mat) return;

    if (mat.map) setTextureRepeat(mat.map, textureRepeatX, textureRepeatY);
    if (mat.roughnessMap) setTextureRepeat(mat.roughnessMap, textureRepeatX, textureRepeatY);
    if (loaded.normalMap) {
      setTextureRepeat(loaded.normalMap, textureRepeatX, textureRepeatY);
      const normalStrength = Math.max(0, Math.min(10, frontNormalStrength));
      const normalScaleVal = (loaded.normalMap ? 1 : FRONT_NORMAL_SCALE) * normalStrength;
      mat.normalScale?.set(normalScaleVal, normalScaleVal);
      if ('clearcoatNormalScale' in mat && mat.clearcoatNormalScale) {
        (mat.clearcoatNormalScale as THREE.Vector2).set(normalScaleVal, normalScaleVal);
      }
    }
    if (loaded.metalnessMap) setTextureRepeat(loaded.metalnessMap, textureRepeatX, textureRepeatY);
    mat.needsUpdate = true;
  }, [textureRepeatX, textureRepeatY, frontNormalStrength]);

  // CPU-heavy params (intensity blending) — debounced to avoid lag while dragging sliders.
  const texIntensityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (texIntensityTimerRef.current) clearTimeout(texIntensityTimerRef.current);
    texIntensityTimerRef.current = setTimeout(() => {
      texIntensityTimerRef.current = null;
      const group = meshGroupRef.current;
      if (!group) return;
      const loaded = loadedTexturesRef.current;
      if (!loaded?.map) return;
      const frontMesh = group.children[0] as THREE.Mesh | undefined;
      if (!frontMesh) return;
      const mat = frontMesh.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial | undefined;
      if (!mat) return;

      const blendedMap = blendMapWithIntensity(loaded.map, Math.max(0, Math.min(1, textureIntensity)));
      setTextureRepeat(blendedMap, textureRepeatX, textureRepeatY);
      mat.map = blendedMap;

      if (loaded.roughnessMap) {
        const rInt = Math.max(0, Math.min(1, textureRoughnessIntensity));
        const roughnessMapForMat =
          rInt >= 0.998
            ? loaded.roughnessMap
            : (blendRoughnessMapWithIntensity(loaded.roughnessMap, rInt) as THREE.Texture);
        setTextureRepeat(roughnessMapForMat, textureRepeatX, textureRepeatY);
        mat.roughnessMap = roughnessMapForMat;
      }

      mat.needsUpdate = true;

      const backMesh = group.children[2] as THREE.Mesh | undefined;
      if (backMesh?.material && backMesh.material !== frontMesh.material) {
        const bMat = backMesh.material as THREE.MeshPhysicalMaterial;
        if (bMat.isMeshPhysicalMaterial || bMat.isMeshStandardMaterial) {
          bMat.map = mat.map;
          bMat.roughnessMap = mat.roughnessMap;
          bMat.needsUpdate = true;
        }
      }
    }, 80);
    return () => {
      if (texIntensityTimerRef.current) clearTimeout(texIntensityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textureRepeat used inside but driven by the other effect
  }, [textureIntensity, textureRoughnessIntensity]);

  useEffect(() => {
    if (!dirLightRef.current || !ambientLightRef.current) return;
    const radius = 15;
    const el = lightElevation * DEG2RAD;
    const az = lightAzimuth * DEG2RAD;
    dirLightRef.current.position.set(
      radius * Math.cos(el) * Math.cos(az),
      radius * Math.sin(el),
      radius * Math.cos(el) * Math.sin(az)
    );
    dirLightRef.current.intensity = 3 * lightIntensity * lightIntensityFromLighting;
    ambientLightRef.current.intensity = Math.max(0.4, ambientIntensity);
    if (meshGroupRef.current && meshGroupRef.current.children[1]) {
      const sideMesh = meshGroupRef.current.children[1] as THREE.Mesh;
      const side = sideMesh.material as THREE.MeshPhysicalMaterial;
      if (side) {
        if (extrusionGlass) {
          side.metalness = 1;
          side.roughness = 0.1;
        } else {
          side.metalness = effectiveMetalness;
          side.roughness = effectiveRoughness;
        }
      }
    }
  }, [
    lightAzimuth,
    lightElevation,
    lightIntensity,
    lightIntensityFromLighting,
    ambientIntensity,
    effectiveMetalness,
    effectiveRoughness,
    extrusionGlass,
  ]);

  useEffect(() => {
    if (!extrusionDirLightRef.current || !extrusionAmbientRef.current) return;
    const radius = 15;
    const el = extrusionLightElevation * DEG2RAD;
    const az = extrusionLightAzimuth * DEG2RAD;
    extrusionDirLightRef.current.position.set(
      radius * Math.cos(el) * Math.cos(az),
      radius * Math.sin(el),
      radius * Math.cos(el) * Math.sin(az)
    );
    extrusionAmbientRef.current.intensity = Math.max(0.3, extrusionLightAmbient);
  }, [extrusionLightAzimuth, extrusionLightElevation, extrusionLightAmbient]);

  if (!customFont && !fontLoaded) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center text-zinc-500">
        Loading 3D font…
      </div>
    );
  }

  if (!content.trim()) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center text-zinc-500">
        Enter text
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[200px] w-full" />;
});
