// src/services/qrService.ts
import MolamQRCode from '../models/molamQrCode';
import { HmacService } from './hmacService';

export class QrService {
    static async generateQRCode(userId: string, amount: number, currency: string, expiresIn: number = 120) {
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        const payload = {
            userId,
            amount,
            currency,
            expiresAt: expiresAt.toISOString(),
            timestamp: Date.now()
        };

        const qrValue = HmacService.signPayload(payload);

        const qrCode = await MolamQRCode.create({
            user_id: userId,
            qr_value: qrValue,
            amount,
            currency,
            expires_at: expiresAt,
            status: ''
        });

        return {
            qr_id: qrCode.id,
            qr_value: qrValue,
            amount: `${amount} ${currency}`,
            expires_at: expiresAt,
        };
    }

    static async scanQRCode(qrValue: string) {
        if (!HmacService.verifySignature(qrValue)) {
            throw new Error('Signature HMAC invalide');
        }

        const payload = HmacService.extractPayload(qrValue);
        const qrCode = await MolamQRCode.findOne({ where: { qr_value: qrValue } });

        if (!qrCode) throw new Error('QR code non trouvé');
        if (qrCode.status !== 'active') throw new Error('QR code déjà utilisé');
        if (new Date() > qrCode.expires_at) throw new Error('QR code expiré');

        return {
            status: 'pending_confirmation',
            transaction_preview: {
                from: '+221770000000',
                to: '+221770111111',
                amount: `${qrCode.amount} ${qrCode.currency}`,
                fee_molam: '25 XOF',
                fee_partner: '0 XOF',
                net: `${(qrCode.amount || 0) - 25} XOF`
            },
            qr_id: qrCode.id
        };
    }

    static async confirmPayment(qrId: string, pin: string) {
        const qrCode = await MolamQRCode.findByPk(qrId);
        if (!qrCode) throw new Error('QR code non trouvé');
        if (qrCode.status !== 'active') throw new Error('QR code invalide');

        // Vérifier PIN (à adapter avec votre logique)
        if (pin !== '1234') throw new Error('PIN incorrect');

        qrCode.status = 'used';
        qrCode.used_at = new Date();
        await qrCode.save();

        return {
            status: 'success',
            transaction_id: `TRF-${Date.now()}`,
            message: `Paiement de ${qrCode.amount} ${qrCode.currency} confirmé`
        };
    }
}