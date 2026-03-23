import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  listCustomElements,
  uploadCustomElementHandler,
  deleteCustomElement,
} from '../controllers/customElementController.js';

const router = Router();

router.get('/', listCustomElements);
router.post('/', authenticateToken, requireAdmin, ...uploadCustomElementHandler);
router.delete('/:id', authenticateToken, requireAdmin, deleteCustomElement);

export default router;
