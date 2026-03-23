import CustomElementAsset from '../models/CustomElementAsset.js';
import { isMongoReady } from '../config/db.js';
import { uploadCustomElement } from '../utils/cloudinary.js';
import { cloudinary } from '../config/cloudinary.js';
import { upload } from '../utils/upload.js';

export const CUSTOM_ELEMENT_CATEGORIES = [
  'icons',
  'social',
  'decorative',
  'shapes-badges',
  'business-events',
];

export async function listCustomElements(_req, res) {
  if (!isMongoReady()) return res.json([]);
  try {
    const items = await CustomElementAsset.find()
      .sort({ category: 1, label: 1 })
      .lean();
    res.json(
      items.map((t) => ({
        id: String(t._id),
        label: t.label,
        category: t.category,
        url: t.url,
        format: t.format,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export const uploadCustomElementHandler = [
  upload.single('file'),
  async (req, res) => {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'MongoDB not connected. Set MONGODB_URI and restart.' });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({ error: 'Cloudinary not configured (CLOUDINARY_* env vars).' });
    }
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Missing file. Upload an image (PNG, SVG, etc.).' });
    }
    const label =
      (req.body.label && String(req.body.label).trim()) ||
      file.originalname?.replace(/\.[^.]+$/, '') ||
      'Custom Element';
    const category = req.body.category && String(req.body.category).trim();
    if (!category || !CUSTOM_ELEMENT_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category. Must be one of: ' + CUSTOM_ELEMENT_CATEGORIES.join(', '),
      });
    }

    const ext = (file.originalname?.match(/\.[^.]+$/) || ['.png'])[0].toLowerCase();
    const formatMap = {
      '.svg': 'svg',
      '.png': 'png',
      '.jpg': 'jpg',
      '.jpeg': 'jpeg',
      '.webp': 'webp',
    };
    const format = formatMap[ext] || 'png';

    try {
      const result = await uploadCustomElement(file.buffer, file.mimetype);
      const doc = await CustomElementAsset.create({
        label,
        category,
        url: result.secure_url,
        publicId: result.public_id,
        format,
      });
      res.json({
        id: String(doc._id),
        label: doc.label,
        category: doc.category,
        url: doc.url,
        format: doc.format,
      });
    } catch (e) {
      console.error('Custom element upload failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
];

export async function deleteCustomElement(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await CustomElementAsset.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      try {
        await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'image' });
      } catch {
        try {
          await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
        } catch {
          /* ignore */
        }
      }
    }
    await CustomElementAsset.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
