// src/routes/products.ts
import { Router } from 'express';
import { getProducts } from '../controllers/productsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/products', authMiddleware, getProducts);

export default router;