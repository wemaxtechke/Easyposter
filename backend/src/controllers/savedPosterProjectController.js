import SavedPosterProject from '../models/SavedPosterProject.js';
import { isMongoReady } from '../config/db.js';
import { uploadDataUrlsInPosterProject, assertNoBlobImageRefsInProject } from '../utils/posterTemplateImages.js';
import { applyPosterProjectPatch } from '../utils/posterProjectPatch.js';
import { destroyCloudinaryAssets, diffRemovedIds } from '../utils/cloudinaryCleanup.js';

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

  if (typeof thumbnail === 'string' && thumbnail.length > 500_000) {
    return res.status(400).json({ error: 'Thumbnail too large (max ~500KB)' });
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
        const status = e?.statusCode === 400 ? 400 : 500;
        return res.status(status).json({
          error:
            status === 400
              ? String(e?.message || e)
              : `Image upload failed: ${e?.message || e}. Ensure Cloudinary is configured.`,
        });
      }
    } else {
      try {
        assertNoBlobImageRefsInProject(project);
      } catch (e) {
        return res.status(e?.statusCode || 400).json({ error: String(e?.message || e) });
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

    if (doc.cloudinaryPublicIds?.length > 0) {
      destroyCloudinaryAssets(doc.cloudinaryPublicIds).catch(() => {});
    }

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
  const patch = req.body?.patch;
  const ifUnmodifiedSince = req.body?.ifUnmodifiedSince;

  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof thumbnail === 'string') {
    if (thumbnail.length > 500_000) {
      return res.status(400).json({ error: 'Thumbnail too large (max ~500KB)' });
    }
    updates.thumbnail = thumbnail;
  }

  try {
    // Fetch the existing doc upfront so we can diff cloudinary IDs later.
    const existing = await SavedPosterProject.findOne({ _id: id, userId })
      .select('updatedAt cloudinaryPublicIds')
      .lean();
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const oldCloudinaryIds = existing.cloudinaryPublicIds ?? [];

    // Conflict guard: if client provides last-known updatedAt, ensure we don't overwrite newer server data.
    if (typeof ifUnmodifiedSince === 'string' && ifUnmodifiedSince) {
      const serverTs = new Date(existing.updatedAt).toISOString();
      if (serverTs !== ifUnmodifiedSince) {
        return res.status(409).json({ error: 'Project was updated elsewhere. Reload and try again.' });
      }
    }

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
          const status = e?.statusCode === 400 ? 400 : 500;
          return res.status(status).json({
            error:
              status === 400
                ? String(e?.message || e)
                : `Image upload failed: ${e?.message || e}. Ensure Cloudinary is configured.`,
          });
        }
      } else {
        try {
          assertNoBlobImageRefsInProject(project);
        } catch (e) {
          return res.status(e?.statusCode || 400).json({ error: String(e?.message || e) });
        }
      }
      updates.project = processedProject;
      updates.cloudinaryPublicIds = publicIds;
    }

    if (patch !== undefined) {
      if (!patch || typeof patch !== 'object') {
        return res.status(400).json({ error: 'Missing patch object' });
      }
      const fullDoc = await SavedPosterProject.findOne({ _id: id, userId }).select('project').lean();
      let patched;
      let publicIds;
      try {
        ({ project: patched, publicIds } = await applyPosterProjectPatch(fullDoc?.project ?? {}, patch));
      } catch (e) {
        const status = e?.statusCode === 400 ? 400 : 500;
        return res.status(status).json({ error: String(e?.message || e) });
      }
      updates.project = patched;
      updates.cloudinaryPublicIds = publicIds;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const doc = await SavedPosterProject.findOneAndUpdate({ _id: id, userId }, updates, {
      new: true,
    }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Clean up any Cloudinary images that were replaced
    if (updates.cloudinaryPublicIds) {
      const removed = diffRemovedIds(oldCloudinaryIds, updates.cloudinaryPublicIds);
      if (removed.length > 0) {
        destroyCloudinaryAssets(removed).catch(() => {});
      }
    }

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
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: String(e?.message || e) });
  }
}

