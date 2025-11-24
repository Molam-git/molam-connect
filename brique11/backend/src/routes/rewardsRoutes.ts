import express from 'express';
import { rewardsController } from '../controllers/rewardsController';

const router = express.Router();

// 1) Liste des récompenses actives
router.get('/active', rewardsController.getActiveRewards);

// 2) Attribution automatique lors d'une transaction
router.post('/apply', rewardsController.applyReward);

// 3) Consultation du solde de récompenses
router.get('/balance', rewardsController.getRewardsBalance);

// 4) Conversion des récompenses
router.post('/convert', rewardsController.convertRewards);

// 5) Utilisation d'un voucher
router.post('/voucher/use', rewardsController.useVoucher);

export default router;