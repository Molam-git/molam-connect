import { Request, Response } from 'express';
import { QrService } from '../services/qrService';

export const generateQR = async (req: Request, res: Response) => {
    try {
        const { amount, currency, expires_in } = req.body;
        const userId = (req as any).user.id; // Récupéré du middleware

        console.log('🔄 Génération QR pour user:', userId);

        // Utiliser le vrai service
        const result = await QrService.generateQRCode(userId, amount, currency, expires_in);

        console.log('✅ QR généré avec succès:', result.qr_id);
        res.json(result);

    } catch (error: any) {
        console.error('❌ Erreur génération QR:', error);
        res.status(400).json({ error: error.message });
    }
};

export const scanQR = async (req: Request, res: Response) => {
    try {
        const { qr_value } = req.body;
        console.log('🔍 Scan QR:', qr_value);

        const result = await QrService.scanQRCode(qr_value);
        res.json(result);

    } catch (error: any) {
        console.error('❌ Erreur scan QR:', error);
        res.status(400).json({ error: error.message });
    }
};

export const confirmPayment = async (req: Request, res: Response) => {
    try {
        const { qr_id, pin } = req.body;
        console.log('✅ Confirmation paiement QR:', qr_id);

        const result = await QrService.confirmPayment(qr_id, pin);
        res.json(result);

    } catch (error: any) {
        console.error('❌ Erreur confirmation paiement:', error);
        res.status(400).json({ error: error.message });
    }
};