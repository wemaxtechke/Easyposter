import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SamService } from './SamService';
import { SAM_MODEL } from './samConfig';

// Mock the transformers library
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue([])),
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

  it('should use the model from samConfig', () => {
    const service = SamService.getInstance();
    expect((service as any).model).toBe(SAM_MODEL);
  });

  it('should load the pipeline with correct parameters', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const service = SamService.getInstance();

    // We need to trigger loadPipeline, which is private.
    // Calling generateMasks will trigger it.
    const mockImage = { width: 100, height: 100 } as HTMLCanvasElement;
    await service.generateMasks(mockImage);

    expect(pipeline).toHaveBeenCalledWith('image-segmentation', SAM_MODEL);
  });
});
