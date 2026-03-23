import path from 'path';
import {
  cloudinary,
  TEXTURE_FOLDER,
  FONT_FOLDER,
  POSTER_TEMPLATE_FOLDER,
  CUSTOM_ELEMENTS_FOLDER,
  POSTER_PROJECT_FOLDER,
} from '../config/cloudinary.js';

export async function uploadToCloudinary(buffer, mimetype) {
  const dataUri = `data:${mimetype || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: TEXTURE_FOLDER,
    resource_type: 'auto',
    use_filename: true,
    unique_filename: true,
  });
}

/** Poster template images (inline data URLs → HTTPS). */
export async function uploadPosterTemplateImage(buffer, mimetype) {
  const dataUri = `data:${mimetype || 'image/png'};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: POSTER_TEMPLATE_FOLDER,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
  });
}

/** User poster project images (data URLs → HTTPS, separate folder from templates). */
export async function uploadPosterProjectImage(buffer, mimetype) {
  const dataUri = `data:${mimetype || 'image/png'};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: POSTER_PROJECT_FOLDER,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
  });
}

/** Custom poster elements (icons, logos, decorative images). PNG, SVG, etc. */
export async function uploadCustomElement(buffer, mimetype) {
  const dataUri = `data:${mimetype || 'image/png'};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: CUSTOM_ELEMENTS_FOLDER,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true,
  });
}

export async function uploadFontToCloudinary(buffer, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const safeExt = ext === '.otf' || ext === '.ttf' ? ext : '.ttf';
  const mime = safeExt === '.otf' ? 'font/otf' : 'font/ttf';
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: FONT_FOLDER,
    resource_type: 'raw',
    use_filename: true,
    unique_filename: true,
  });
}
