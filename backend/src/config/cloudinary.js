import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const TEXTURE_FOLDER = process.env.CLOUDINARY_TEXTURE_FOLDER || '3d-text-editor/textures';
export const FONT_FOLDER = process.env.CLOUDINARY_FONT_FOLDER || '3d-text-editor/fonts';
export const POSTER_TEMPLATE_FOLDER =
  process.env.CLOUDINARY_POSTER_TEMPLATE_FOLDER || '3d-text-editor/poster-templates';
export const CUSTOM_ELEMENTS_FOLDER =
  process.env.CLOUDINARY_CUSTOM_ELEMENTS_FOLDER || '3d-text-editor/custom-elements';
export const POSTER_PROJECT_FOLDER =
  process.env.CLOUDINARY_POSTER_PROJECT_FOLDER || '3d-text-editor/poster-projects';
export { cloudinary };
