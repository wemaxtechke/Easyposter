import { isMongoReady } from '../config/db.js';

export function getHealth(_req, res) {
  res.json({
    ok: true,
    mongo: isMongoReady(),
    cloudinary: Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    ),
  });
}
