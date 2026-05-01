import UserPosterImage from '../models/UserPosterImage.js';
import { isMongoReady } from '../config/db.js';
import { uploadUserPosterLibraryImage } from '../utils/cloudinary.js';
import { cloudinary } from '../config/cloudinary.js';
import { upload } from '../utils/upload.js';

function hasCloudinaryConfig() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function parsePoster3dConfig(body) {
  if (!body || body.poster3dConfig == null || body.poster3dConfig === '') return undefined;
  const raw = body.poster3dConfig;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return undefined;
}

function jsonUserPosterImage(doc) {
  const o = {
    id: String(doc._id),
    url: doc.url,
    originalName: doc.originalName || '',
    createdAt: doc.createdAt,
  };
  if (doc.poster3dConfig != null) o.poster3dConfig = doc.poster3dConfig;
  return o;
}

export async function listUserPosterImages(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const items = await UserPosterImage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(items.map((t) => jsonUserPosterImage(t)));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export const uploadUserPosterImageHandler = [
  upload.single('file'),
  async (req, res) => {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'MongoDB not connected. Set MONGODB_URI and restart.' });
    }
    if (!hasCloudinaryConfig()) {
      return res.status(503).json({ error: 'Cloudinary not configured (CLOUDINARY_* env vars).' });
    }
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Missing file. Upload an image.' });
    }

    const originalName = file.originalname ? String(file.originalname).slice(0, 500) : '';
    const poster3dConfig = parsePoster3dConfig(req.body);

    try {
      const result = await uploadUserPosterLibraryImage(file.buffer, file.mimetype, userId);
      const doc = await UserPosterImage.create({
        userId,
        url: result.secure_url,
        publicId: result.public_id,
        originalName,
        ...(poster3dConfig !== undefined ? { poster3dConfig } : {}),
      });
      res.json(jsonUserPosterImage(doc));
    } catch (e) {
      console.error('User poster image upload failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
];

export const replaceUserPosterImageHandler = [
  upload.single('file'),
  async (req, res) => {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'MongoDB not connected. Set MONGODB_URI and restart.' });
    }
    if (!hasCloudinaryConfig()) {
      return res.status(503).json({ error: 'Cloudinary not configured (CLOUDINARY_* env vars).' });
    }
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Missing file. Upload an image.' });
    }

    const originalName = file.originalname ? String(file.originalname).slice(0, 500) : '';
    const poster3dConfig = parsePoster3dConfig(req.body);

    try {
      const doc = await UserPosterImage.findOne({ _id: req.params.id, userId });
      if (!doc) return res.status(404).json({ error: 'Not found' });

      const oldPublicId = doc.publicId;
      const result = await uploadUserPosterLibraryImage(file.buffer, file.mimetype, userId);

      if (oldPublicId && oldPublicId !== result.public_id && hasCloudinaryConfig()) {
        try {
          await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'image' });
        } catch {
          /* ignore */
        }
      }

      doc.url = result.secure_url;
      doc.publicId = result.public_id;
      doc.originalName = originalName || doc.originalName;
      if (poster3dConfig !== undefined) doc.poster3dConfig = poster3dConfig;
      await doc.save();

      res.json(jsonUserPosterImage(doc));
    } catch (e) {
      console.error('User poster image replace failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
];

export async function deleteUserPosterImage(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const doc = await UserPosterImage.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (hasCloudinaryConfig()) {
      try {
        await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'image' });
      } catch {
        /* ignore */
      }
    }
    await UserPosterImage.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
