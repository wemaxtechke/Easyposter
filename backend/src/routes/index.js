import { Router } from 'express';
import { listHdrs } from '../controllers/hdrController.js';
import { getHealth } from '../controllers/healthController.js';
import authRoutes from './authRoutes.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { getTextures, uploadTextures, deleteTexture } from '../controllers/textureController.js';
import { getFonts, uploadFont, deleteFont } from '../controllers/fontController.js';
import {
  listPosterTemplates,
  getPosterTemplate,
  createPosterTemplate,
  updatePosterTemplate,
  deletePosterTemplate,
} from '../controllers/posterTemplateController.js';
import { getPosterProject, savePosterProject } from '../controllers/posterProjectController.js';
import {
  listMySavedPosterProjects,
  createMySavedPosterProject,
  deleteMySavedPosterProject,
  updateMySavedPosterProject,
} from '../controllers/savedPosterProjectController.js';
import posterAiRoutes from './posterAiRoutes.js';
import threeTextAiRoutes from './threeTextAiRoutes.js';
import aiRoutes from './aiRoutes.js';
import customElementRoutes from './customElementRoutes.js';
import { magicLayersFromPoster } from '../controllers/magicLayersController.js';
import { removeBg } from '../controllers/removeBgController.js';
import { recreateDesign } from '../controllers/recreateDesignController.js';
import {
  listUserPosterImages,
  uploadUserPosterImageHandler,
  replaceUserPosterImageHandler,
  deleteUserPosterImage,
} from '../controllers/userPosterImageController.js';
import { upload } from '../utils/upload.js';

const router = Router();

router.use('/auth', authRoutes);
router.get('/hdrs', listHdrs);
router.get('/health', getHealth);
router.post('/magic-layers', authenticateToken, upload.single('image'), magicLayersFromPoster);
router.post('/remove-bg', authenticateToken, upload.single('image'), removeBg);
router.post('/recreate-design', authenticateToken, upload.single('image'), recreateDesign);
router.get('/poster-templates', listPosterTemplates);
router.get('/poster-templates/:id', getPosterTemplate);
router.post('/poster-templates', authenticateToken, createPosterTemplate);
router.patch('/poster-templates/:id', authenticateToken, updatePosterTemplate);
router.delete('/poster-templates/:id', authenticateToken, requireAdmin, deletePosterTemplate);
router.get('/poster-projects', authenticateToken, getPosterProject);
router.post('/poster-projects', authenticateToken, savePosterProject);

// User-private saved posters ("My stuff")
router.get('/my-poster-projects', authenticateToken, listMySavedPosterProjects);
router.post('/my-poster-projects', authenticateToken, createMySavedPosterProject);
router.delete('/my-poster-projects/:id', authenticateToken, deleteMySavedPosterProject);
router.patch('/my-poster-projects/:id', authenticateToken, updateMySavedPosterProject);
router.get('/user-poster-images', authenticateToken, listUserPosterImages);
router.post('/user-poster-images', authenticateToken, ...uploadUserPosterImageHandler);
router.patch('/user-poster-images/:id', authenticateToken, ...replaceUserPosterImageHandler);
router.delete('/user-poster-images/:id', authenticateToken, deleteUserPosterImage);
router.get('/textures', getTextures);
router.post('/textures/upload', authenticateToken, requireAdmin, ...uploadTextures);
router.delete('/textures/:id', authenticateToken, requireAdmin, deleteTexture);
router.get('/fonts', getFonts);
router.post('/fonts/upload', authenticateToken, requireAdmin, ...uploadFont);
router.delete('/fonts/:id', authenticateToken, requireAdmin, deleteFont);
router.use('/poster-ai', authenticateToken, posterAiRoutes);
router.use('/3d-text-ai', authenticateToken, threeTextAiRoutes);
router.use('/ai', authenticateToken, aiRoutes);
router.use('/custom-elements', customElementRoutes);

export default router;
