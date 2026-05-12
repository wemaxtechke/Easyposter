import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SamService } from './SamService';
import { SAM_MODEL } from './samConfig';

// Mock the transformers library
vi.mock('@huggingface/transformers', () => ({
  AutoModelForMaskGeneration: {
    from_pretrained: vi.fn().mockResolvedValue({
      get_image_embeddings: vi.fn().mockResolvedValue({ image_embeddings: {} }),
      forward: vi.fn().mockResolvedValue({
        pred_masks: { data: new Float32Array(256 * 256 * 3) },
        iou_scores: { data: [0.9, 0.9, 0.9] }
      }),
      // Handle the callable model instance
      // In JS, if we want the mock to be callable, we usually return a function from a proxy or similar,
      // but here SamService calls it as `await model({...})`.
    })
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(
        vi.fn().mockResolvedValue({}),
        {
          post_process_masks: vi.fn().mockResolvedValue([{ data: new Uint8Array(100 * 100 * 3) }])
        }
      )
    )
  },
  RawImage: {
    fromCanvas: vi.fn().mockResolvedValue({ width: 100, height: 100 })
  },
  Tensor: vi.fn().mockImplementation(function(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }),
  env: {
    allowLocalModels: true
  }
}));

describe('SamService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Since it's a singleton, we might need to reset its instance if possible,
    // but for basic tests, clearAllMocks should be enough if we don't rely on internal state between tests.
  });

  it('should be a singleton', () => {
    const instance1 = SamService.getInstance();
    const instance2 = SamService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should use the modelId from samConfig', () => {
    const service = SamService.getInstance();
    expect((service as any).modelId).toBe(SAM_MODEL);
  });

  it('should load the model and processor and run generateMasks', async () => {
    const service = SamService.getInstance();
    const mockImage = { width: 100, height: 100 } as any;

    const mockModel = Object.assign(vi.fn().mockResolvedValue({
      pred_masks: { data: new Float32Array(256 * 256 * 3) },
      iou_scores: { data: [0.9, 0.9, 0.9] }
    }), {
      get_image_embeddings: vi.fn().mockResolvedValue({ image_embeddings: {} }),
    });

    const mockProcessor = Object.assign(vi.fn().mockResolvedValue({}), {
      post_process_masks: vi.fn().mockResolvedValue([{ data: new Uint8Array(100 * 100 * 3) }])
    });

    // @ts-ignore
    vi.spyOn(service, 'loadModelAndProcessor').mockResolvedValue({
      model: mockModel as any,
      processor: mockProcessor as any
    });

    const masks = await service.generateMasks(mockImage);

    expect(masks).toBeDefined();
    expect(mockModel.get_image_embeddings).toHaveBeenCalled();
    expect(mockModel).toHaveBeenCalled();
  });
});
