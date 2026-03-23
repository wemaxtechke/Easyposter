import { Router } from 'express';
import { posterAiUsage } from '../controllers/posterAiController.js';

const router = Router();

router.get('/usage', posterAiUsage);

export default router;
