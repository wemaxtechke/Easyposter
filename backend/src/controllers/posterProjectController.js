import PosterProject from '../models/PosterProject.js';
import { isMongoReady } from '../config/db.js';
import { cloudinary } from '../config/cloudinary.js';
import { uploadDataUrlsInPosterProject } from '../utils/posterTemplateImages.js';

function hasCloudinaryConfig() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * GET /api/poster-projects
 * Load the current user's auto-saved poster project.
 */
export async function getPosterProject(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const doc = await PosterProject.findOne({ userId }).lean();
    if (!doc || !doc.project) {
      return res.json({ project: null });
    }
    res.json({ project: doc.project });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

/**
 * POST /api/poster-projects
 * Save the current user's poster project. Uploads data: images to Cloudinary.
 * Upserts (one project per user).
 */
export async function savePosterProject(req, res) {
  if (!isMongoReady()) {
    return res.status(503).json({ error: 'MongoDB not connected.' });
  }
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const project = req.body?.project;
  if (!project || typeof project !== 'object' || !Array.isArray(project.elements)) {
    return res.status(400).json({ error: 'Missing project with elements array' });
  }

  try {
    let processedProject = project;
    let publicIds = [];

    if (hasCloudinaryConfig()) {
      try {
        const result = await uploadDataUrlsInPosterProject(project, 'project');
        processedProject = result.project;
        publicIds = result.publicIds;
      } catch (e) {
        return res.status(500).json({
          error: `Image upload failed: ${e?.message || e}. Ensure Cloudinary is configured.`,
        });
      }
    }

    const doc = await PosterProject.findOneAndUpdate(
      { userId },
      { project: processedProject, cloudinaryPublicIds: publicIds },
      { upsert: true, new: true }
    );

    res.json({ ok: true, updatedAt: doc.updatedAt, project: processedProject });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
