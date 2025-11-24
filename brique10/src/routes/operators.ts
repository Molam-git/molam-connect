// src/routes/operators.ts
import { Router } from 'express';
import { getOperators } from '../controllers/operatorsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/operators', authMiddleware, getOperators);

export default router;