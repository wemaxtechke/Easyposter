import { create } from 'zustand';
import type { MagicLayer, MagicLayerStore, PosterPathPoint, MagicLayerElement } from '../types';
import { usePosterStore } from './posterStore';
import { generateElementId } from '../utils/generateElementId';

export const useMagicLayerStore = create<MagicLayerStore>((set, get) => ({
  magicLayers: [],
  activeMagicLayerId: null,
  brushSettings: {
    radius: 30,
    hardness: 0.5,
    strength: 1.0,
    mode: 'add',
  },

  setBrushSettings: (settings) => {
    set(state => ({
      brushSettings: { ...state.brushSettings, ...settings }
    }));
  },

  createMagicLayerFromSelection: async () => {
    const { marqueeLocalPath, marqueeTargetId, elements, canvasWidth, canvasHeight } = usePosterStore.getState();
    if (!marqueeLocalPath || !marqueeTargetId) return;

    const sourceElement = elements.find(e => e.id === marqueeTargetId);
    if (!sourceElement) return;

    const { DetectionEngine } = await import('../selection/DetectionEngine');
    // We need the fabric canvas to get the element as canvas
    const { getFabricCanvasRef } = await import('../canvasRef');
    const fabricCanvas = getFabricCanvasRef();
    if (!fabricCanvas) return;

    const engine = new DetectionEngine(fabricCanvas);
    const fabricObj = fabricCanvas.getObjects().find((o: any) => o.data?.posterId === marqueeTargetId);
    if (!fabricObj) return;

    let sourceCanvas: HTMLCanvasElement;
    if (typeof (fabricObj as any).toCanvasElement === 'function') {
      sourceCanvas = (fabricObj as any).toCanvasElement({ multiplier: 1, enableRetinaScaling: false });
    } else {
      return;
    }

    const id = generateElementId();
    const alphaMask = await DetectionEngine.createAlphaMask(marqueeLocalPath, sourceCanvas.width, sourceCanvas.height);
    const isolatedCanvas = await DetectionEngine.extractPixels(sourceCanvas, alphaMask);

    const sourceCtx = sourceCanvas.getContext('2d');
    const sourceImageData = sourceCtx!.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    const newLayer: MagicLayer = {
      id,
      sourceObjectId: marqueeTargetId,
      sourceImageData,
      isolatedCanvas,
      alphaMask,
      contourPath: marqueeLocalPath[0] || [],
      islands: marqueeLocalPath.length > 1 ? marqueeLocalPath : undefined,
      transform: {
        x: sourceElement.left,
        y: sourceElement.top,
        scaleX: sourceElement.scaleX,
        scaleY: sourceElement.scaleY,
        rotation: sourceElement.angle,
      },
      bounds: {
        x: 0,
        y: 0,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
      },
      editable: true,
      visible: true,
      locked: false,
      createdAt: Date.now(),
    };

    set(state => ({
      magicLayers: [...state.magicLayers, newLayer],
      activeMagicLayerId: id,
    }));

    usePosterStore.getState().addElement({
      type: 'magic-layer',
      left: sourceElement.left,
      top: sourceElement.top,
      scaleX: sourceElement.scaleX,
      scaleY: sourceElement.scaleY,
      angle: sourceElement.angle,
      opacity: 1,
      sourceObjectId: marqueeTargetId,
      isolatedSrc: isolatedCanvas.toDataURL('image/png'),
      sourceSrc: sourceCanvas.toDataURL('image/png'),
      contourPath: marqueeLocalPath[0] || [],
      islands: marqueeLocalPath.length > 1 ? marqueeLocalPath : undefined,
    } as MagicLayerElement);
  },

  updateMagicLayerMask: async (id, mask) => {
    const layer = get().magicLayers.find(l => l.id === id);
    if (!layer) return;

    const { DetectionEngine } = await import('../selection/DetectionEngine');

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = layer.sourceImageData.width;
    sourceCanvas.height = layer.sourceImageData.height;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx!.putImageData(layer.sourceImageData, 0, 0);

    const isolatedCanvas = await DetectionEngine.extractPixels(sourceCanvas, mask);

    set(state => ({
      magicLayers: state.magicLayers.map(l => l.id === id ? { ...l, alphaMask: mask, isolatedCanvas } : l)
    }));

    usePosterStore.getState().updateElement(id, {
      isolatedSrc: isolatedCanvas.toDataURL('image/png'),
    } as Partial<MagicLayerElement>);
  },

  refineMagicLayer: (id) => {
    set({ activeMagicLayerId: id });
    // TODO: Open refinement UI
  },

  deleteMagicLayer: (id) => {
    set(state => ({
      magicLayers: state.magicLayers.filter(l => l.id !== id),
      activeMagicLayerId: state.activeMagicLayerId === id ? null : state.activeMagicLayerId
    }));
    usePosterStore.getState().removeElements([id]);
  },

  duplicateMagicLayer: (id) => {
    const layer = get().magicLayers.find(l => l.id === id);
    if (!layer) return;

    const newId = generateElementId();
    const newLayer = { ...layer, id: newId, createdAt: Date.now() };

    set(state => ({
      magicLayers: [...state.magicLayers, newLayer]
    }));

    // Also duplicate in main store - this might need more logic to handle the backing data
    usePosterStore.getState().duplicateElements([id]);
  },

  reorderMagicLayer: (id, newIndex) => {
    // This probably should just follow the main store's z-index
  },

  commitMagicLayer: async (id, removePixels = false) => {
    const layer = get().magicLayers.find(l => l.id === id);
    if (!layer) return;

    if (removePixels) {
      const { DetectionEngine } = await import('../selection/DetectionEngine');

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = layer.sourceImageData.width;
      sourceCanvas.height = layer.sourceImageData.height;
      const sourceCtx = sourceCanvas.getContext('2d');
      sourceCtx!.putImageData(layer.sourceImageData, 0, 0);

      const subtractedCanvas = await DetectionEngine.subtractMaskFromImage(sourceCanvas, layer.alphaMask);
      const newSrc = subtractedCanvas.toDataURL('image/png');

      const posterStore = usePosterStore.getState();
      const sourceElement = posterStore.elements.find(e => e.id === layer.sourceObjectId);
      if (sourceElement && (sourceElement.type === 'image' || sourceElement.type === '3d-text')) {
        posterStore.updateElement(layer.sourceObjectId, {
          [sourceElement.type === 'image' ? 'src' : 'image']: newSrc
        });
      }
    }

    set({ activeMagicLayerId: null });
  },

  toggleMagicLayerVisibility: (id) => {
    set(state => ({
      magicLayers: state.magicLayers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    }));
    const layer = get().magicLayers.find(l => l.id === id);
    if (layer) {
      usePosterStore.getState().updateElement(id, { opacity: layer.visible ? 1 : 0 });
    }
  },

  setActiveMagicLayer: (id) => {
    set({ activeMagicLayerId: id });
  },

  registerMagicLayer: (layer: MagicLayer) => {
    set(state => {
      if (state.magicLayers.find(l => l.id === layer.id)) return state;
      return { magicLayers: [...state.magicLayers, layer] };
    });
  },

  createMagicLayersFromSam: async (elementId: string) => {
    const { elements } = usePosterStore.getState();
    const sourceElement = elements.find(e => e.id === elementId);
    if (!sourceElement || (sourceElement.type !== 'image' && sourceElement.type !== '3d-text')) return;

    const { getFabricCanvasRef } = await import('../canvasRef');
    const fabricCanvas = getFabricCanvasRef();
    if (!fabricCanvas) return;

    const fabricObj = fabricCanvas.getObjects().find((o: any) => o.data?.posterId === elementId);
    if (!fabricObj) return;

    let sourceCanvas: HTMLCanvasElement;
    if (typeof (fabricObj as any).toCanvasElement === 'function') {
      sourceCanvas = (fabricObj as any).toCanvasElement({ multiplier: 1, enableRetinaScaling: false });
    } else {
      return;
    }

    const { DetectionEngine } = await import('../selection/DetectionEngine');
    const sourceCtx = sourceCanvas.getContext('2d');
    const sourceImageData = sourceCtx!.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    try {
      const { SamService } = await import('../services/SamService');
      const samService = SamService.getInstance();
      const samMasks = await samService.generateMasks(sourceCanvas);

      for (const samMask of samMasks) {
        const id = generateElementId();
        const alphaMask = samMask.data;
        const isolatedCanvas = await DetectionEngine.extractPixels(sourceCanvas, alphaMask);

        const contours = DetectionEngine.traceContoursFromMask(alphaMask, samMask.width, samMask.height);
        if (contours.length === 0) continue;

        const newLayer: MagicLayer = {
          id,
          sourceObjectId: elementId,
          sourceImageData,
          isolatedCanvas,
          alphaMask,
          contourPath: contours[0] || [],
          islands: contours.length > 1 ? contours : undefined,
          transform: {
            x: sourceElement.left,
            y: sourceElement.top,
            scaleX: sourceElement.scaleX,
            scaleY: sourceElement.scaleY,
            rotation: sourceElement.angle,
          },
          bounds: {
            x: 0,
            y: 0,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
          },
          editable: true,
          visible: true,
          locked: false,
          createdAt: Date.now(),
          createdFrom: 'sam',
        };

        set(state => ({
          magicLayers: [...state.magicLayers, newLayer],
        }));

        usePosterStore.getState().addElement({
          type: 'magic-layer',
          id,
          left: sourceElement.left,
          top: sourceElement.top,
          scaleX: sourceElement.scaleX,
          scaleY: sourceElement.scaleY,
          angle: sourceElement.angle,
          opacity: 1,
          sourceObjectId: elementId,
          isolatedSrc: isolatedCanvas.toDataURL('image/png'),
          sourceSrc: sourceCanvas.toDataURL('image/png'),
          contourPath: contours[0] || [],
          islands: contours.length > 1 ? contours : undefined,
        } as MagicLayerElement);
      }
    } catch (error) {
      console.error('SAM processing failed, falling back to contour detection:', error);

      const engine = new DetectionEngine(fabricCanvas);
      const contours = await engine.generatePrecisePathLocal(elementId);

      if (contours && contours.length > 0) {
        const id = generateElementId();
        const alphaMask = await DetectionEngine.createAlphaMask(contours, sourceCanvas.width, sourceCanvas.height);
        const isolatedCanvas = await DetectionEngine.extractPixels(sourceCanvas, alphaMask);

        const newLayer: MagicLayer = {
          id,
          sourceObjectId: elementId,
          sourceImageData,
          isolatedCanvas,
          alphaMask,
          contourPath: contours[0] || [],
          islands: contours.length > 1 ? contours : undefined,
          transform: {
            x: sourceElement.left,
            y: sourceElement.top,
            scaleX: sourceElement.scaleX,
            scaleY: sourceElement.scaleY,
            rotation: sourceElement.angle,
          },
          bounds: {
            x: 0,
            y: 0,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
          },
          editable: true,
          visible: true,
          locked: false,
          createdAt: Date.now(),
          createdFrom: 'contour',
        };

        set(state => ({
          magicLayers: [...state.magicLayers, newLayer],
        }));

        usePosterStore.getState().addElement({
          type: 'magic-layer',
          id,
          left: sourceElement.left,
          top: sourceElement.top,
          scaleX: sourceElement.scaleX,
          scaleY: sourceElement.scaleY,
          angle: sourceElement.angle,
          opacity: 1,
          sourceObjectId: elementId,
          isolatedSrc: isolatedCanvas.toDataURL('image/png'),
          sourceSrc: sourceCanvas.toDataURL('image/png'),
          contourPath: contours[0] || [],
          islands: contours.length > 1 ? contours : undefined,
        } as MagicLayerElement);
      }
    }
  },
}));
