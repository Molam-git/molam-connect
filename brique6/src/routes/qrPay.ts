// src/routes/qrPay.ts
import { Router } from 'express';
import { generateQR, scanQR, confirmPayment } from '../controllers/qrController';
import { authMiddleware } from '../middleware/authMiddleware';
import { qrRateLimit } from '../middleware/qrRateLimit';

const router = Router();

router.post('/generate', qrRateLimit, authMiddleware, generateQR);
router.post('/scan', authMiddleware, scanQR);
router.post('/confirm', authMiddleware, confirmPayment);

export default router;