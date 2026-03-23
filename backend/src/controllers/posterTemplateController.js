import PosterTemplateAsset from '../models/PosterTemplateAsset.js';
import User from '../models/User.js';
import { isMongoReady } from '../config/db.js';
import { cloudinary } from '../config/cloudinary.js';
import { uploadDataUrlsInPosterProject, parseDataUrl } from '../utils/posterTemplateImages.js';
import { uploadPosterTemplateImage } from '../utils/cloudinary.js';

const ALLOWED_CATEGORIES = new Set(['church', 'conference', 'business', 'event', 'general']);

function hasCloudinaryConfig() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/** List summaries for gallery (no full project). */
export async function listPosterTemplates(_req, res) {
  if (!isMongoReady()) return res.json([]);
  try {
    const items = await PosterTemplateAsset.find().sort({ updatedAt: -1 }).select('-project').lean();
    res.json(
      items.map((t) => ({
        id: t.templateId,
        name: t.name,
        category: t.category,
        description: t.description || undefined,
        thumbnail: t.thumbnail || undefined,
        creatorId: t.creatorId ? String(t.creatorId) : undefined,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

/** Full template for editor / fill modal. */
export async function getPosterTemplate(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await PosterTemplateAsset.findOne({ templateId: req.params.id }).lean();
    if (!doc) return res.status(404).json({ error: 'Template not found' });
    res.json({
      id: doc.templateId,
      name: doc.name,
      category: doc.category,
      description: doc.description || undefined,
      fields: doc.fields || [],
      project: doc.project,
      thumbnail: doc.thumbnail || undefined,
      creatorId: doc.creatorId ? String(doc.creatorId) : undefined,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

/**
 * Create template: uploads data: images to Cloudinary, stores document in MongoDB.
 * Requires authentication. User is upgraded to 'creator' on first template.
 */
export async function createPosterTemplate(req, res) {
  if (!isMongoReady()) {
    return res.status(503).json({ error: 'MongoDB not connected. Set MONGODB_URI and restart.' });
  }
  if (!hasCloudinaryConfig()) {
    return res.status(503).json({ error: 'Cloudinary not configured (CLOUDINARY_* env vars).' });
  }
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required to create templates.' });
  }

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const project = body.project;

  if (!name) return res.status(400).json({ error: 'Missing name' });
  if (!ALLOWED_CATEGORIES.has(category)) {
    return res.status(400).json({ error: `Invalid category. Use one of: ${[...ALLOWED_CATEGORIES].join(', ')}` });
  }
  if (!project || typeof project !== 'object' || !Array.isArray(project.elements)) {
    return res.status(400).json({ error: 'Missing project with elements array' });
  }

  let templateId =
    typeof body.templateId === 'string' && body.templateId.trim()
      ? body.templateId.trim()
      : `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const existing = await PosterTemplateAsset.findOne({ templateId });
  if (existing) {
    templateId = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  try {
    const { project: processedProject, publicIds } = await uploadDataUrlsInPosterProject(project);
    const description =
      typeof body.description === 'string' && body.description.trim() ? body.description.trim() : undefined;
    const fields = Array.isArray(body.fields) ? body.fields : [];

    let thumbnailUrl;
    if (typeof body.thumbnail === 'string' && body.thumbnail.startsWith('data:')) {
      const parsed = parseDataUrl(body.thumbnail);
      if (parsed) {
        const result = await uploadPosterTemplateImage(parsed.buffer, parsed.mime);
        thumbnailUrl = result.secure_url;
        publicIds.push(result.public_id);
      }
    }

    await PosterTemplateAsset.create({
      templateId,
      name,
      category,
      description,
      fields,
      project: processedProject,
      thumbnail: thumbnailUrl,
      cloudinaryPublicIds: publicIds,
      creatorId: userId,
    });

    // Upgrade user to creator on first template
    let userUpgraded = false;
    const user = await User.findById(userId);
    if (user && user.role === 'user') {
      const count = await PosterTemplateAsset.countDocuments({ creatorId: userId });
      if (count <= 1) {
        user.role = 'creator';
        await user.save({ validateBeforeSave: false });
        userUpgraded = true;
      }
    }

    const payload = {
      id: templateId,
      name,
      category,
      description,
      fieldsCount: fields.length,
      imagesUploaded: publicIds.length,
      thumbnail: thumbnailUrl,
    };
    if (userUpgraded && user) {
      payload.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
      };
    }
    res.status(201).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

/**
 * Update template metadata, fields, project, and thumbnail.
 * Allowed: admin (any template) OR creator (own templates only).
 */
export async function updatePosterTemplate(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  const userRole = req.userRole;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const doc = await PosterTemplateAsset.findOne({ templateId: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const isAdmin = userRole === 'admin';
    const isCreatorOfTemplate =
      userRole === 'creator' && doc.creatorId && doc.creatorId.toString() === userId;
    if (!isAdmin && !isCreatorOfTemplate) {
      return res.status(403).json({ error: 'You can only edit your own templates.' });
    }

    const body = req.body || {};
    if (typeof body.name === 'string' && body.name.trim()) {
      doc.name = body.name.trim();
    }
    if (typeof body.category === 'string' && ALLOWED_CATEGORIES.has(body.category.trim())) {
      doc.category = body.category.trim();
    }
    if ('description' in body) {
      doc.description =
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim()
          : undefined;
    }
    if (Array.isArray(body.fields)) {
      doc.fields = body.fields.filter(
        (f) =>
          f &&
          typeof f.key === 'string' &&
          typeof f.label === 'string' &&
          typeof f.sourceElementId === 'string'
      );
    }

    if (body.project && typeof body.project === 'object' && Array.isArray(body.project.elements)) {
      if (!hasCloudinaryConfig()) {
        return res.status(503).json({ error: 'Cloudinary not configured for project update.' });
      }
      const { project: processedProject, publicIds } = await uploadDataUrlsInPosterProject(body.project);
      doc.project = processedProject;
      doc.cloudinaryPublicIds = [...(doc.cloudinaryPublicIds || []), ...publicIds];
    }

    if (typeof body.thumbnail === 'string' && body.thumbnail.startsWith('data:')) {
      if (!hasCloudinaryConfig()) {
        return res.status(503).json({ error: 'Cloudinary not configured for thumbnail update.' });
      }
      const parsed = parseDataUrl(body.thumbnail);
      if (parsed) {
        const result = await uploadPosterTemplateImage(parsed.buffer, parsed.mime);
        doc.thumbnail = result.secure_url;
        if (result.public_id) {
          doc.cloudinaryPublicIds = [...(doc.cloudinaryPublicIds || []), result.public_id];
        }
      }
    }

    await doc.save();
    res.json({
      id: doc.templateId,
      name: doc.name,
      category: doc.category,
      description: doc.description,
      fieldsCount: (doc.fields || []).length,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function deletePosterTemplate(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await PosterTemplateAsset.findOne({ templateId: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    if (hasCloudinaryConfig() && Array.isArray(doc.cloudinaryPublicIds)) {
      for (const pid of doc.cloudinaryPublicIds) {
        try {
          await cloudinary.uploader.destroy(pid, { resource_type: 'image' });
        } catch {
          /* ignore */
        }
      }
    }

    await doc.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
