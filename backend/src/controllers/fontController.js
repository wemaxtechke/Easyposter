import path from 'path';
import FontAsset from '../models/FontAsset.js';
import { isMongoReady } from '../config/db.js';
import { uploadFontToCloudinary } from '../utils/cloudinary.js';
import { cloudinary } from '../config/cloudinary.js';
import { upload } from '../utils/upload.js';

export async function getFonts(_req, res) {
  if (!isMongoReady()) return res.json([]);
  try {
    const items = await FontAsset.find().sort({ createdAt: -1 }).lean();
    res.json(
      items.map((f) => ({
        id: String(f._id),
        label: f.label,
        fontUrl: f.fontUrl,
        fileName: f.fileName || null,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export const uploadFont = [
  upload.single('font'),
  async (req, res) => {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'MongoDB not connected.' });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({ error: 'Cloudinary not configured.' });
    }
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Missing file field "font" (TTF or OTF).' });
    }
    const name = file.originalname || 'font.ttf';
    const ext = path.extname(name).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') {
      return res.status(400).json({ error: 'Only .ttf and .otf files are allowed.' });
    }
    const label =
      (req.body.label && String(req.body.label).trim()) ||
      name.replace(/\.(ttf|otf)$/i, '') ||
      'Font';
    try {
      const result = await uploadFontToCloudinary(file.buffer, name);
      const doc = await FontAsset.create({
        label,
        fontUrl: result.secure_url,
        publicId: result.public_id,
        fileName: name,
      });
      res.json({
        id: String(doc._id),
        label: doc.label,
        fontUrl: doc.fontUrl,
        fileName: doc.fileName,
      });
    } catch (e) {
      console.error('Font upload failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
];

export async function deleteFont(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await FontAsset.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET &&
      doc.publicId
    ) {
      try {
        await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
      } catch {
        /* ignore */
      }
    }
    await FontAsset.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
