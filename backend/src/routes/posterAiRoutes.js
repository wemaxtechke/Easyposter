import { Router } from 'express';
import {
  posterAiChat,
  posterAiUsage,
  suggestPosterFields,
  wizardIdentify,
  wizardGatherFields,
} from '../controllers/posterAiController.js';
import { fromReferencePoster } from '../controllers/fromReferenceDesignController.js';

const router = Router();

router.post('/chat', posterAiChat);
router.post('/suggest-fields', suggestPosterFields);
router.get('/usage', posterAiUsage);
router.post('/wizard-identify', wizardIdentify);
router.post('/wizard-gather-fields', wizardGatherFields);
router.post('/from-reference', fromReferencePoster);

export default router;
