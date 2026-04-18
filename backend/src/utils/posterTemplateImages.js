import { uploadPosterTemplateImage, uploadPosterProjectImage } from './cloudinary.js';

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/is;

/**
 * @returns {{ mime: string, buffer: Buffer } | null}
 */
export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1].split(';')[0].trim() || 'image/png', buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

const uploadImageFns = {
  template: uploadPosterTemplateImage,
  project: uploadPosterProjectImage,
};

/**
 * @throws {Error & { statusCode?: number }} if any raster layer still uses a browser-local blob: URL
 * (not portable across devices or server-side).
 */
export function assertNoBlobImageRefsInProject(project) {
  if (!project || typeof project !== 'object' || !Array.isArray(project.elements)) return;
  const problems = [];
  for (const el of project.elements) {
    if (!el || typeof el !== 'object') continue;
    const id = typeof el.id === 'string' ? el.id : '?';
    if (el.type === 'image') {
      if (typeof el.src === 'string' && el.src.startsWith('blob:')) problems.push(`image ${id} (src)`);
      if (typeof el.originalSrc === 'string' && el.originalSrc.startsWith('blob:')) {
        problems.push(`image ${id} (originalSrc)`);
      }
    }
    if (el.type === '3d-text' && typeof el.image === 'string' && el.image.startsWith('blob:')) {
      problems.push(`3d-text ${id}`);
    }
  }
  if (problems.length === 0) return;
  const err = new Error(
    `Project contains browser-only image URLs (blob:), which cannot be synced or opened on other devices. ` +
      `On the device where you edited this poster, open it and click Save (with image hosting configured), or re-add the missing images. ` +
      `Affected: ${problems.slice(0, 6).join(', ')}${problems.length > 6 ? '…' : ''}`
  );
  err.statusCode = 400;
  throw err;
}

/**
 * Upload data: image URLs inside poster project to Cloudinary; replace with secure_url.
 * @param {object} project - Poster project with elements
 * @param {'template'|'project'} [target='template'] - Use 'template' for templates, 'project' for user projects
 * @returns {Promise<{ project: object, publicIds: string[] }>}
 */
export async function uploadDataUrlsInPosterProject(project, target = 'template') {
  const upload = uploadImageFns[target] || uploadPosterTemplateImage;
  const publicIds = [];
  const projectClone = JSON.parse(JSON.stringify(project));
  const elements = projectClone.elements;
  if (!Array.isArray(elements)) {
    return { project: projectClone, publicIds };
  }

  for (const el of elements) {
    if (el.type === 'image' && typeof el.src === 'string') {
      const parsed = parseDataUrl(el.src);
      if (parsed) {
        const r = await upload(parsed.buffer, parsed.mime);
        el.src = r.secure_url;
        if (r.public_id) publicIds.push(r.public_id);
      }
    }
    if (el.type === 'image' && typeof el.originalSrc === 'string') {
      const parsed = parseDataUrl(el.originalSrc);
      if (parsed) {
        const r = await upload(parsed.buffer, parsed.mime);
        el.originalSrc = r.secure_url;
        if (r.public_id) publicIds.push(r.public_id);
      }
    }
    if (el.type === '3d-text' && typeof el.image === 'string') {
      const parsed = parseDataUrl(el.image);
      if (parsed) {
        const r = await upload(parsed.buffer, parsed.mime);
        el.image = r.secure_url;
        if (r.public_id) publicIds.push(r.public_id);
      }
    }
  }

  assertNoBlobImageRefsInProject(projectClone);

  return { project: projectClone, publicIds };
}
