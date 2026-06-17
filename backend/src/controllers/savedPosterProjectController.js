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

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));
  const skip = (page - 1) * limit;

  try {
    const [docs, total] = await Promise.all([
      SavedPosterProject.find({ userId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-project') // Exclude heavy project data from the list
        .lean(),
      SavedPosterProject.countDocuments({ userId }),
    ]);

    res.json({
      items: docs.map((d) => ({
        id: String(d._id),
        name: d.name,
        thumbnail: d.thumbnail,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function getMySavedPosterProject(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const id = req.params.id;
  try {
    const doc = await SavedPosterProject.findOne({ _id: id, userId }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    res.json({
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
    let processedThumbnail = thumbnail;
    let publicIds = [];

    if (hasCloudinaryConfig()) {
      try {
        const result = await uploadDataUrlsInPosterProject(project, 'project');
        processedProject = result.project;
        publicIds = result.publicIds;

        const { parseDataUrl } = await import('../utils/posterTemplateImages.js');
        const thumbParsed = parseDataUrl(thumbnail);
        if (thumbParsed) {
          const { uploadPosterProjectImage } = await import('../utils/cloudinary.js');
          const r = await uploadPosterProjectImage(thumbParsed.buffer, thumbParsed.mime);
          processedThumbnail = r.secure_url;
          if (r.public_id) publicIds.push(r.public_id);
        }
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
      thumbnail: typeof processedThumbnail === 'string' && processedThumbnail ? processedThumbnail : undefined,
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
  let processedThumbnail = thumbnail;

  try {
    // Fetch the existing doc upfront so we can diff cloudinary IDs later.
    const existing = await SavedPosterProject.findOne({ _id: id, userId })
      .select('updatedAt cloudinaryPublicIds')
      .lean();
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const oldCloudinaryIds = existing.cloudinaryPublicIds ?? [];
    let publicIds = [...oldCloudinaryIds];

    if (typeof thumbnail === 'string') {
      if (thumbnail.length > 500_000) {
        return res.status(400).json({ error: 'Thumbnail too large (max ~500KB)' });
      }
      if (hasCloudinaryConfig()) {
        const { parseDataUrl } = await import('../utils/posterTemplateImages.js');
        const thumbParsed = parseDataUrl(thumbnail);
        if (thumbParsed) {
          const { uploadPosterProjectImage } = await import('../utils/cloudinary.js');
          const r = await uploadPosterProjectImage(thumbParsed.buffer, thumbParsed.mime);
          processedThumbnail = r.secure_url;
          if (r.public_id) publicIds.push(r.public_id);
          updates.cloudinaryPublicIds = publicIds;
        }
      }
      updates.thumbnail = processedThumbnail;
    }

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
      let projectPublicIds = [];
      if (hasCloudinaryConfig()) {
        try {
          const result = await uploadDataUrlsInPosterProject(project, 'project');
          processedProject = result.project;
          projectPublicIds = result.publicIds;
          publicIds = [...new Set([...publicIds, ...projectPublicIds])];
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
      let patchPublicIds;
      try {
        ({ project: patched, publicIds: patchPublicIds } = await applyPosterProjectPatch(
          fullDoc?.project ?? {},
          patch,
          publicIds // Use current accumulated publicIds
        ));
        publicIds = patchPublicIds;
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
      returnDocument: 'after',
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

