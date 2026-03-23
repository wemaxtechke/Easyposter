import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** HDR files live in frontend public; backend reads to list them. */
export const HDR_DIR = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'hdr');
