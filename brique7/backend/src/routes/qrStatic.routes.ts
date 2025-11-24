import { Router } from 'express';
import { QRStaticController } from '../controllers/qrStatic.controller';
import { authenticate } from '../middleware/auth';
// Si vous n'avez pas de rate limiting, supprimez cette ligne
// import { qrRateLimit } from '../middleware/rateLimit';

const router = Router();
const controller = new QRStaticController();

// Routes publiques
router.post('/parse', controller.parseQR);

// Routes protégées
router.post('/assign', authenticate, controller.assignQR);
router.post('/create-payment', authenticate, controller.createPayment);
router.post('/confirm', authenticate, controller.confirmPayment);
router.post('/cancel', authenticate, controller.cancelPayment);
router.post('/deactivate', authenticate, controller.deactivateQR);
router.post('/rotate', authenticate, controller.rotateQR);

export default router;