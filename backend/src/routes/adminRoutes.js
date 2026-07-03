import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

// Apply admin protection to all routes
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminController.updateUser);

export default router;
