import { pipeline, env } from '@xenova/transformers';

// Configuration for Transformers.js
env.allowLocalModels = false;

let samPipeline: any = null;

export interface SamMask {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  score: number;
}

export class SamService {
  private static instance: SamService;
  private model: string = 'Xenova/mobile-sam';

  private constructor() {}

  public static getInstance(): SamService {
    if (!SamService.instance) {
      SamService.instance = new SamService();
    }
    return SamService.instance;
  }

  private async loadPipeline() {
    if (!samPipeline) {
      samPipeline = await pipeline('mask-generation', this.model);
    }
    return samPipeline;
  }

  /**
   * Runs SAM on the provided image and returns a set of candidate masks.
   */
  public async generateMasks(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<SamMask[]> {
    const pipe = await this.loadPipeline();

    const maxDim = 1024;
    let processCanvas = imageElement;
    let scaleFactor = 1;

    if (imageElement.width > maxDim || imageElement.height > maxDim) {
      scaleFactor = maxDim / Math.max(imageElement.width, imageElement.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(imageElement.width * scaleFactor);
      canvas.height = Math.round(imageElement.height * scaleFactor);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        processCanvas = canvas;
      }
    }

    // Transformers.js 'mask-generation' pipeline
    const output = await pipe(processCanvas);

    const rawMasks = output.masks;
    const scores = output.scores;

    const masks: SamMask[] = [];
    for (let i = 0; i < rawMasks.length; i++) {
      const m = rawMasks[i];

      // Rescale mask back to original image dimensions if needed
      let maskData: Uint8ClampedArray;
      let maskWidth = imageElement.width;
      let maskHeight = imageElement.height;

      if (m.width !== maskWidth || m.height !== maskHeight) {
        // Use an OffscreenCanvas to rescale the mask data
        const tempCanvas = new OffscreenCanvas(m.width, m.height);
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          const imgData = tempCtx.createImageData(m.width, m.height);
          for (let j = 0; j < m.data.length; j++) {
            const val = m.data[j] > 0.5 ? 255 : 0;
            imgData.data[j * 4] = val;
            imgData.data[j * 4 + 1] = val;
            imgData.data[j * 4 + 2] = val;
            imgData.data[j * 4 + 3] = 255;
          }
          tempCtx.putImageData(imgData, 0, 0);

          const finalCanvas = new OffscreenCanvas(maskWidth, maskHeight);
          const finalCtx = finalCanvas.getContext('2d');
          if (finalCtx) {
            finalCtx.imageSmoothingEnabled = false;
            finalCtx.drawImage(tempCanvas, 0, 0, maskWidth, maskHeight);
            const finalData = finalCtx.getImageData(0, 0, maskWidth, maskHeight);
            maskData = new Uint8ClampedArray(maskWidth * maskHeight);
            for (let j = 0; j < finalData.data.length; j += 4) {
              maskData[j / 4] = finalData.data[j] > 127 ? 255 : 0;
            }
          } else {
            maskData = new Uint8ClampedArray(maskWidth * maskHeight); // fallback
          }
        } else {
          maskData = new Uint8ClampedArray(maskWidth * maskHeight); // fallback
        }
      } else {
        maskData = new Uint8ClampedArray(m.width * m.height);
        for (let j = 0; j < m.data.length; j++) {
          maskData[j] = m.data[j] > 0.5 ? 255 : 0;
        }
      }

      masks.push({
        data: maskData,
        width: maskWidth,
        height: maskHeight,
        score: scores[i] || 1.0,
      });
    }

    return this.filterAndMergeMasks(masks, imageElement.width, imageElement.height);
  }

  private filterAndMergeMasks(masks: SamMask[], originalWidth: number, originalHeight: number): SamMask[] {
    const totalArea = originalWidth * originalHeight;
    const minArea = totalArea * 0.01; // 1% of image

    // 1. Filter by area and score
    let filtered = masks.filter(m => {
      let area = 0;
      for (let i = 0; i < m.data.length; i++) {
        if (m.data[i] > 0) area++;
      }
      return area > minArea && m.score > 0.5;
    });

    // 2. Merge overlapping masks (IoU)
    const result: SamMask[] = [];
    const usedIndices = new Set<number>();

    // Sort by score descending to keep best ones
    filtered.sort((a, b) => b.score - a.score);

    for (let i = 0; i < filtered.length; i++) {
      if (usedIndices.has(i)) continue;

      let currentMask = filtered[i];
      usedIndices.add(i);

      for (let j = i + 1; j < filtered.length; j++) {
        if (usedIndices.has(j)) continue;

        const iou = this.calculateIoU(currentMask, filtered[j]);
        if (iou > 0.8) {
          usedIndices.add(j);
        }
      }
      result.push(currentMask);
    }

    return result;
  }

  private calculateIoU(m1: SamMask, m2: SamMask): number {
    if (m1.width !== m2.width || m1.height !== m2.height) return 0;

    let intersection = 0;
    let union = 0;
    for (let i = 0; i < m1.data.length; i++) {
      const v1 = m1.data[i] > 0;
      const v2 = m2.data[i] > 0;
      if (v1 && v2) intersection++;
      if (v1 || v2) union++;
    }

    return union === 0 ? 0 : intersection / union;
  }
}
