import fs from 'fs';
import { HDR_DIR } from '../config/paths.js';
import HdrAsset from '../models/HdrAsset.js';
import { isMongoReady } from '../config/db.js';
import { uploadHdrToCloudinary } from '../utils/cloudinary.js';
import { cloudinary } from '../config/cloudinary.js';
import { upload } from '../utils/upload.js';

export async function listHdrs(_req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  const hdrs = [];

  // 1. Local files
  try {
    if (fs.existsSync(HDR_DIR)) {
      const files = fs.readdirSync(HDR_DIR, { withFileTypes: true });
      const localHdrs = files
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.hdr'))
        .map((d) => {
          const name = d.name.replace(/\.hdr$/i, '');
          const label = name
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          return { id: `local-${name}`, label, path: `/hdr/${d.name}`, isLocal: true };
        });
      hdrs.push(...localHdrs);
    }
  } catch (e) {
    console.error('Failed to read HDR directory', e);
  }

  // 2. Cloud assets
  if (isMongoReady()) {
    try {
      const cloudHdrs = await HdrAsset.find().sort({ createdAt: -1 }).lean();
      hdrs.push(
        ...cloudHdrs.map((h) => ({
          id: String(h._id),
          label: h.label,
          path: h.hdrUrl,
          isLocal: false,
        }))
      );
    } catch (e) {
      console.error('Failed to fetch cloud HDRs', e);
    }
  }

  res.json(hdrs);
}

export const uploadHdr = [
  upload.single('hdr'),
  async (req, res) => {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'MongoDB not connected.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Missing HDR file.' });
    }
    const label = (req.body.label && String(req.body.label).trim()) ||
                  req.file.originalname.replace(/\.hdr$/i, '') ||
                  'New HDR';

    try {
      const result = await uploadHdrToCloudinary(req.file.buffer, req.file.originalname);
      const doc = await HdrAsset.create({
        label,
        hdrUrl: result.secure_url,
        hdrPublicId: result.public_id,
      });
      res.json({
        id: String(doc._id),
        label: doc.label,
        path: doc.hdrUrl,
        isLocal: false,
      });
    } catch (e) {
      console.error('HDR upload failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  }
];

export async function deleteHdr(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await HdrAsset.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      try {
        await cloudinary.uploader.destroy(doc.hdrPublicId, { resource_type: 'raw' });
      } catch (e) {
        console.warn('Failed to delete HDR from Cloudinary:', e);
      }
    }
    await HdrAsset.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
