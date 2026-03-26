import { uploadDataUrlsInPosterProject } from './posterTemplateImages.js';

/**
 * Apply a patch onto a poster project. This is a "replace per element id" merge:
 * - canvas props: if provided, overwrite
 * - removeElementIds: delete those elements by id
 * - upsertElements: for each element, replace by id or add if missing
 *
 * @param {object} baseProject
 * @param {{canvasWidth?: number, canvasHeight?: number, canvasBackground?: any, removeElementIds?: string[], upsertElements?: any[]}} patch
 */
export async function applyPosterProjectPatch(baseProject, patch) {
  const next = JSON.parse(JSON.stringify(baseProject || {}));
  next.elements = Array.isArray(next.elements) ? next.elements : [];

  if (typeof patch.canvasWidth === 'number') next.canvasWidth = patch.canvasWidth;
  if (typeof patch.canvasHeight === 'number') next.canvasHeight = patch.canvasHeight;
  if (patch.canvasBackground && typeof patch.canvasBackground === 'object') {
    next.canvasBackground = patch.canvasBackground;
  }

  const removeIds = new Set(Array.isArray(patch.removeElementIds) ? patch.removeElementIds : []);
  if (removeIds.size) {
    next.elements = next.elements.filter((e) => !removeIds.has(e.id));
  }

  const upserts = Array.isArray(patch.upsertElements) ? patch.upsertElements : [];
  if (upserts.length) {
    const byId = new Map(next.elements.map((e) => [e.id, e]));
    for (const el of upserts) {
      if (!el || typeof el !== 'object' || typeof el.id !== 'string') continue;
      byId.set(el.id, el);
    }
    next.elements = [...byId.values()];
  }

  // Upload data URLs only for elements we upserted by running the existing uploader
  // against a minimal project containing only those elements, then re-merge.
  if (upserts.length) {
    const mini = { canvasWidth: next.canvasWidth, canvasHeight: next.canvasHeight, elements: upserts };
    const { project: processedMini, publicIds } = await uploadDataUrlsInPosterProject(mini, 'project');
    const processedById = new Map((processedMini.elements || []).map((e) => [e.id, e]));
    next.elements = next.elements.map((e) => processedById.get(e.id) ?? e);
    return { project: next, publicIds };
  }

  return { project: next, publicIds: [] };
}

