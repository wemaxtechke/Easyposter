import TextureAsset from '../models/TextureAsset.js';
import { isMongoReady } from '../config/db.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { cloudinary } from '../config/cloudinary.js';
import { upload } from '../utils/upload.js';

export async function getTextures(_req, res) {
  if (!isMongoReady()) return res.json([]);
  try {
    const items = await TextureAsset.find().sort({ createdAt: -1 }).lean();
    res.json(
      items.map((t) => ({
        id: String(t._id),
        label: t.label,
        mapUrl: t.mapUrl,
        roughnessUrl: t.roughnessUrl || null,
        normalUrl: t.normalUrl || null,
        metalnessUrl: t.metalnessUrl || null,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export const uploadTextures = [
  upload.fields([
    { name: 'map', maxCount: 1 },
    { name: 'roughness', maxCount: 1 },
    { name: 'normal', maxCount: 1 },
    { name: 'metalness', maxCount: 1 },
  ]),
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
    const mapFile = req.files?.map?.[0];
    if (!mapFile?.buffer) {
      return res.status(400).json({ error: 'Missing file field "map" (color / diffuse image).' });
    }
    const label =
      (req.body.label && String(req.body.label).trim()) ||
      mapFile.originalname?.replace(/\.[^.]+$/, '') ||
      'Texture';

    try {
      const mapResult = await uploadToCloudinary(mapFile.buffer, mapFile.mimetype);
      const out = {
        label,
        mapUrl: mapResult.secure_url,
        mapPublicId: mapResult.public_id,
      };

      if (req.files?.roughness?.[0]?.buffer) {
        const r = await uploadToCloudinary(
          req.files.roughness[0].buffer,
          req.files.roughness[0].mimetype
        );
        out.roughnessUrl = r.secure_url;
        out.roughnessPublicId = r.public_id;
      }
      if (req.files?.normal?.[0]?.buffer) {
        const r = await uploadToCloudinary(req.files.normal[0].buffer, req.files.normal[0].mimetype);
        out.normalUrl = r.secure_url;
        out.normalPublicId = r.public_id;
      }
      if (req.files?.metalness?.[0]?.buffer) {
        const r = await uploadToCloudinary(
          req.files.metalness[0].buffer,
          req.files.metalness[0].mimetype
        );
        out.metalnessUrl = r.secure_url;
        out.metalnessPublicId = r.public_id;
      }

      const doc = await TextureAsset.create(out);
      res.json({
        id: String(doc._id),
        label: doc.label,
        mapUrl: doc.mapUrl,
        roughnessUrl: doc.roughnessUrl || null,
        normalUrl: doc.normalUrl || null,
        metalnessUrl: doc.metalnessUrl || null,
      });
    } catch (e) {
      console.error('Texture upload failed:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
];

export async function deleteTexture(req, res) {
  if (!isMongoReady()) return res.status(503).json({ error: 'MongoDB not connected.' });
  try {
    const doc = await TextureAsset.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const ids = [doc.mapPublicId, doc.roughnessPublicId, doc.normalPublicId, doc.metalnessPublicId].filter(
      Boolean
    );

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      for (const publicId of ids) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        } catch {
          try {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
          } catch {
            /* ignore */
          }
        }
      }
    }
    await TextureAsset.deleteOne({ _id: doc._id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
