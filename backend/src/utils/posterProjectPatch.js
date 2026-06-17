import { uploadDataUrlsInPosterProject, assertNoBlobImageRefsInProject } from './posterTemplateImages.js';

/**
 * Apply a patch onto a poster project. This is a "replace per element id" merge:
 * - canvas props: if provided, overwrite
 * - removeElementIds: delete those elements by id
 * - upsertElements: for each element, replace by id or add if missing
 *
 * @param {object} baseProject
 * @param {{canvasWidth?: number, canvasHeight?: number, canvasBackground?: any, removeElementIds?: string[], upsertElements?: any[]}} patch
 * @param {string[]} [existingPublicIds=[]]
 */
export async function applyPosterProjectPatch(baseProject, patch, existingPublicIds = []) {
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
  let patchPublicIds = [];
  if (upserts.length) {
    const mini = { canvasWidth: next.canvasWidth, canvasHeight: next.canvasHeight, elements: upserts };
    const { project: processedMini, publicIds } = await uploadDataUrlsInPosterProject(mini, 'project');
    patchPublicIds = publicIds;
    const processedById = new Map((processedMini.elements || []).map((e) => [e.id, e]));
    next.elements = next.elements.map((e) => processedById.get(e.id) ?? e);
  }

  // Recalculate which Cloudinary IDs are still in use across the entire project.
  // We include existingPublicIds (from untouched layers) plus any new ones from this patch.
  const allInProject = new Set();
  for (const el of next.elements) {
    if (el.type === 'image') {
      if (typeof el.src === 'string' && !el.src.startsWith('data:') && !el.src.startsWith('blob:'))
        allInProject.add(el.src);
      if (typeof el.originalSrc === 'string' && !el.originalSrc.startsWith('data:') && !el.originalSrc.startsWith('blob:'))
        allInProject.add(el.originalSrc);
    }
    if (el.type === '3d-text' && typeof el.image === 'string' && !el.image.startsWith('data:') && !el.image.startsWith('blob:'))
      allInProject.add(el.image);
  }

  const finalPublicIds = [
    ...existingPublicIds,
    ...patchPublicIds
  ].filter(id => {
    // A bit tricky: we store public IDs but elements have URLs.
    // Most Cloudinary URLs contain the public ID.
    // For simplicity, we keep any ID that appears as a substring in any element URL.
    return Array.from(allInProject).some(url => url.includes(id));
  });

  assertNoBlobImageRefsInProject(next);
  return { project: next, publicIds: Array.from(new Set(finalPublicIds)) };
}

