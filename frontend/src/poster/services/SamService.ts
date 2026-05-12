import { AutoModelForMaskGeneration, AutoProcessor, RawImage, Tensor, env } from '@huggingface/transformers';
import { SAM_MODEL } from './samConfig';

// Configuration for Transformers.js
env.allowLocalModels = false;

let samModel: any = null;
let samProcessor: any = null;

export interface SamMask {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  score: number;
}

export class SamService {
  private static instance: SamService;
  private modelId: string = SAM_MODEL;

  private constructor() {}

  public static getInstance(): SamService {
    if (!SamService.instance) {
      SamService.instance = new SamService();
    }
    return SamService.instance;
  }

  private async loadModelAndProcessor() {
    if (!samModel || !samProcessor) {
      try {
        samProcessor = await AutoProcessor.from_pretrained(this.modelId);
        samModel = await AutoModelForMaskGeneration.from_pretrained(this.modelId);
      } catch (error) {
        console.error('Failed to load SAM model/processor:', error);
        throw error;
      }
    }
    return { model: samModel, processor: samProcessor };
  }

  /**
   * Runs SAM on the provided image and returns a set of candidate masks.
   */
  public async generateMasks(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<SamMask[]> {
    const { model, processor } = await this.loadModelAndProcessor();

    const image = await RawImage.fromCanvas(imageElement);
    const inputs = await processor(image);

    // 1. Get image embeddings (done once per image)
    const { image_embeddings } = await model.get_image_embeddings(inputs);

    // 2. Generate a grid of points as prompts (5x5 grid)
    const numPointsSide = 5;
    const points = [];
    for (let i = 1; i <= numPointsSide; i++) {
      for (let j = 1; j <= numPointsSide; j++) {
        points.push([
          (i * image.width) / (numPointsSide + 1),
          (j * image.height) / (numPointsSide + 1)
        ]);
      }
    }

    const allMasks: SamMask[] = [];

    // 3. Run decoder for each point prompt
    for (const point of points) {
      const input_points = new Tensor('float32', new Float32Array(point), [1, 1, 2]);
      const input_labels = new Tensor('int64', new BigInt64Array([1n]), [1, 1]);

      const output = await model({
        ...inputs,
        image_embeddings,
        input_points,
        input_labels,
      });

      // output.pred_masks is [1, 1, 3, 256, 256]
      // output.iou_scores is [1, 1, 3]

      const decodedMasks = await processor.post_process_masks(
        output.pred_masks,
        [[image.height, image.width]],
        [[image.height, image.width]]
      );
      // decodedMasks is Tensor[] of length 1, each Tensor [1, 3, H, W]

      const maskTensor = decodedMasks[0];
      const scores = output.iou_scores.data;

      for (let m = 0; m < 3; m++) {
        const score = scores[m];
        if (score < 0.8) continue; // Only keep high-confidence masks

        const maskData = new Uint8ClampedArray(image.width * image.height);
        const offset = m * image.width * image.height;
        for (let k = 0; k < maskData.length; k++) {
          maskData[k] = maskTensor.data[offset + k] ? 255 : 0;
        }

        allMasks.push({
          data: maskData,
          width: image.width,
          height: image.height,
          score: score,
        });
      }
    }

    return this.filterAndMergeMasks(allMasks, image.width, image.height);
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
