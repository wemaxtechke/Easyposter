import SavedPosterProject from '../models/SavedPosterProject.js';
import { isMongoReady } from '../config/db.js';
import { uploadDataUrlsInPosterProject } from '../utils/posterTemplateImages.js';

function hasCloudinaryConfig() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export async function listMySavedPosterProjects(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const docs = await SavedPosterProject.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json({
      items: docs.map((d) => ({
        id: String(d._id),
        name: d.name,
        thumbnail: d.thumbnail,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        project: d.project,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function createMySavedPosterProject(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const name = req.body?.name;
  const project = req.body?.project;
  const thumbnail = req.body?.thumbnail;

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

    const doc = await SavedPosterProject.create({
      userId,
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Untitled poster',
      project: processedProject,
      thumbnail: typeof thumbnail === 'string' && thumbnail ? thumbnail : undefined,
      cloudinaryPublicIds: publicIds,
    });

    res.json({
      ok: true,
      item: {
        id: String(doc._id),
        name: doc.name,
        thumbnail: doc.thumbnail,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        project: processedProject,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function deleteMySavedPosterProject(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const id = req.params.id;
  try {
    const doc = await SavedPosterProject.findOneAndDelete({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function updateMySavedPosterProject(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const id = req.params.id;
  const name = req.body?.name;
  const project = req.body?.project;
  const thumbnail = req.body?.thumbnail;

  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof thumbnail === 'string') updates.thumbnail = thumbnail;

  try {
    if (project !== undefined) {
      if (!project || typeof project !== 'object' || !Array.isArray(project.elements)) {
        return res.status(400).json({ error: 'Missing project with elements array' });
      }
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
      updates.project = processedProject;
      updates.cloudinaryPublicIds = publicIds;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const doc = await SavedPosterProject.findOneAndUpdate({ _id: id, userId }, updates, {
      new: true,
    }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({
      ok: true,
      item: {
        id: String(doc._id),
        name: doc.name,
        thumbnail: doc.thumbnail,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        project: doc.project,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

