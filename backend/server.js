/**
 * Backend: HDR list, MongoDB texture library, Cloudinary uploads.
 * Run: npm start  (default port 5174; Vite proxies /api → here)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { connectDB } from './src/config/db.js';
import './src/config/cloudinary.js';
import apiRoutes from './src/routes/index.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';

const PORT = Number(process.env.BACKEND_PORT || process.env.API_PORT || process.env.PORT) || 5174;

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : undefined;

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(
  cors(
    ALLOWED_ORIGINS
      ? { origin: ALLOWED_ORIGINS, credentials: true }
      : { origin: true }
  )
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please wait a moment.' },
});
app.use('/api/poster-ai', aiLimiter);
app.use('/api/3d-text-ai', aiLimiter);
app.use('/api/magic-layers', aiLimiter);
app.use('/api/remove-bg', aiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

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
