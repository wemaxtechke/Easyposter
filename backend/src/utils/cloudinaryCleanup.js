import { cloudinary } from '../config/cloudinary.js';

/**
 * Destroy a list of Cloudinary public IDs (best-effort, never throws).
 * @param {string[]} publicIds
 */
export async function destroyCloudinaryAssets(publicIds) {
  if (!Array.isArray(publicIds) || publicIds.length === 0) return;
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return;
  }
  for (const pid of publicIds) {
    try {
      await cloudinary.uploader.destroy(pid, { resource_type: 'image' });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Given old and new arrays of public IDs, return the ones that were removed.
 */
export function diffRemovedIds(oldIds, newIds) {
  if (!Array.isArray(oldIds) || oldIds.length === 0) return [];
  const kept = new Set(newIds || []);
  return oldIds.filter((id) => !kept.has(id));
}
