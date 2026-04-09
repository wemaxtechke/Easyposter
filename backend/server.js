/**
 * Backend: HDR list, MongoDB texture library, Cloudinary uploads.
 * Run: npm start  (default port 5174; Vite proxies /api → here)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { connectDB } from './src/config/db.js';
import './src/config/cloudinary.js';
import apiRoutes from './src/routes/index.js';

const PORT = Number(process.env.BACKEND_PORT || process.env.API_PORT || process.env.PORT) || 5174;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/api', apiRoutes);

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Backend http://localhost:${PORT}`);
    console.log('  Auth: POST /api/auth/signup | POST /api/auth/login | GET /api/auth/me');
    console.log('  GET  /api/hdrs, /api/textures, /api/fonts, /api/poster-templates, /api/poster-projects, /api/health');
    console.log('  POST /api/magic-layers (multipart image → OCR draft layers; needs GOOGLE_CLOUD_VISION_API_KEY)');
    console.log('  POST /api/textures/upload | POST /api/fonts/upload | POST /api/poster-templates | POST /api/poster-projects');
  });
}

start();
