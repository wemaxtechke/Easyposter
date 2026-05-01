import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Per-request upload timeout (ms). SDK default ~60s often returns http 499 on large/slow uploads. */
export const CLOUDINARY_UPLOAD_TIMEOUT_MS = Math.max(
  60_000,
  parseInt(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || '180000', 10) || 180_000
);

export const TEXTURE_FOLDER = process.env.CLOUDINARY_TEXTURE_FOLDER || '3d-text-editor/textures';
export const FONT_FOLDER = process.env.CLOUDINARY_FONT_FOLDER || '3d-text-editor/fonts';
export const POSTER_TEMPLATE_FOLDER =
  process.env.CLOUDINARY_POSTER_TEMPLATE_FOLDER || '3d-text-editor/poster-templates';
export const CUSTOM_ELEMENTS_FOLDER =
  process.env.CLOUDINARY_CUSTOM_ELEMENTS_FOLDER || '3d-text-editor/custom-elements';
export const POSTER_PROJECT_FOLDER =
  process.env.CLOUDINARY_POSTER_PROJECT_FOLDER || '3d-text-editor/poster-projects';
/** Per-user poster image library (subfolder per userId at upload time). */
export const USER_POSTER_IMAGE_FOLDER =
  process.env.CLOUDINARY_USER_POSTER_IMAGE_FOLDER || '3d-text-editor/user-poster-images';

export { cloudinary };
