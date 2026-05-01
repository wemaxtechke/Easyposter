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

export async function listUserPosterImages(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const items = await UserPosterImage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(
      items.map((t) => ({
        id: String(t._id),
        url: t.url,
        originalName: t.originalName || '',
        createdAt: t.createdAt,
      }))
    );
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

    try {
      const result = await uploadUserPosterLibraryImage(file.buffer, file.mimetype, userId);
      const doc = await UserPosterImage.create({
        userId,
        url: result.secure_url,
        publicId: result.public_id,
        originalName,
      });
      res.json({
        id: String(doc._id),
        url: doc.url,
        originalName: doc.originalName,
        createdAt: doc.createdAt,
      });
    } catch (e) {
      console.error('User poster image upload failed:', e);
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
