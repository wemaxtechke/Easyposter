import { Router } from 'express';
import { threeTextAiGenerate, threeTextAiAdjust } from '../controllers/threeTextAiController.js';
import { generateShapeAi } from '../controllers/shapeAiController.js';

const router = Router();

router.post('/generate', threeTextAiGenerate);
router.post('/adjust', threeTextAiAdjust);
router.post('/generate-shape', generateShapeAi);

export default router;
