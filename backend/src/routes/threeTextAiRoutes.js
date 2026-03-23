import { Router } from 'express';
import { threeTextAiGenerate, threeTextAiAdjust } from '../controllers/threeTextAiController.js';

const router = Router();

router.post('/generate', threeTextAiGenerate);
router.post('/adjust', threeTextAiAdjust);

export default router;
