import { Router } from 'express';
import { posterAiChat, posterAiUsage, suggestPosterFields } from '../controllers/posterAiController.js';

const router = Router();

router.post('/chat', posterAiChat);
router.post('/suggest-fields', suggestPosterFields);
router.get('/usage', posterAiUsage);

export default router;
