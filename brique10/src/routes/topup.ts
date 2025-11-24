// src/routes/topup.ts
import { Router } from 'express';
import {
    createTopup,
    cancelTopup,
    getTransactionStatus,
    getRecommendations,
    getTopupHistory,
    ussdTopupHandler,
    getOperators,
    getProducts
} from '../controllers/topupController';
import { authMiddleware } from '../middleware/auth';
import { validateTopup } from '../middleware/validation';

const router = Router();

// Routes API REST
router.get('/operators', authMiddleware, getOperators);
router.get('/products', authMiddleware, getProducts);
router.post('/create', authMiddleware, validateTopup, createTopup);
router.post('/cancel', authMiddleware, cancelTopup);
router.get('/status', authMiddleware, getTransactionStatus);
router.get('/recommendations', authMiddleware, getRecommendations);
router.get('/history', authMiddleware, getTopupHistory);

// Route USSD
router.post('/ussd', ussdTopupHandler);

export default router;