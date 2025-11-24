import { Request, Response } from 'express';
import { QRStaticService } from '../services/qrStatic.service';

const qrService = new QRStaticService();

export class QRStaticController {
    async assignQR(req: Request, res: Response) {
        try {
            const result = await qrService.assignQR(req.body);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    async parseQR(req: Request, res: Response) {
        try {
            const result = await qrService.parseQR(req.body.qr_value);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    async createPayment(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const result = await qrService.createPayment(req.body, userId);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    async confirmPayment(req: Request, res: Response) {
        try {
            const result = await qrService.confirmPayment(req.body.payment_id, req.body.pin);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    async cancelPayment(req: Request, res: Response) {
        try {
            await qrService.cancelPayment(req.body.payment_id);
            res.json({ status: 'cancelled' });
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    // ⭐ AJOUTEZ CES MÉTHODES MANQUANTES ⭐
    async deactivateQR(req: Request, res: Response) {
        try {
            const { qr_id } = req.body;
            await qrService.deactivateQR(qr_id);
            res.json({ status: 'deactivated' });
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    async rotateQR(req: Request, res: Response) {
        try {
            const { qr_id } = req.body;
            const result = await qrService.rotateQR(qr_id);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }
}