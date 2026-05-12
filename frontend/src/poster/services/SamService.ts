import { pipeline, env } from '@huggingface/transformers';
import { SAM_MODEL } from './samConfig';

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
  private model: string = SAM_MODEL;

  private constructor() {}

  public static getInstance(): SamService {
    if (!SamService.instance) {
      SamService.instance = new SamService();
    }
    return SamService.instance;
  }

  private async loadPipeline() {
    if (!samPipeline) {
      try {
        samPipeline = await pipeline('image-segmentation', this.model);
      } catch (error) {
        console.error('Failed to load SAM pipeline:', error);
        throw error;
      }
    }
    return samPipeline;
  }

  /**
   * Runs SAM on the provided image and returns a set of candidate masks.
   */
  public async generateMasks(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<SamMask[]> {
    const pipe = await this.loadPipeline();

    // Transformers.js 'image-segmentation' pipeline (the replacement for SAM in v3/v4)
    // The pipeline handles resizing internally if needed.
    const output = await pipe(imageElement);

    const masks: SamMask[] = [];
    for (const item of output) {
      // 'image-segmentation' returns an array of { label: string|null, score: number|null, mask: RawImage }
      const { score, mask } = item;

      // Ensure mask is single-channel grayscale for our SamMask format
      const grayscaleMask = mask.channels === 1 ? mask : mask.clone().grayscale();

      // The mask from the pipeline is already scaled to the input image size by default,
      // but we should ensure it matches our expectations.
      const maskWidth = grayscaleMask.width;
      const maskHeight = grayscaleMask.height;

      // Convert RawImage data to our expected Uint8ClampedArray (binary 0 or 255)
      const maskData = new Uint8ClampedArray(maskWidth * maskHeight);
      for (let i = 0; i < grayscaleMask.data.length; i++) {
        maskData[i] = grayscaleMask.data[i] > 127 ? 255 : 0;
      }

      masks.push({
        data: maskData,
        width: maskWidth,
        height: maskHeight,
        score: score || 1.0,
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
