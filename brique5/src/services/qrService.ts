// src/services/qrService.ts
import { db } from '../utils/db';
import { ReferenceGenerator } from '../utils/referenceGenerator';
import { QRCode } from '../types/transfer';

export class QRService {
    static async generateDynamicQR(
        userId: string,
        walletId: string,
        amount?: number,
        currency?: string,
        metadata: Record<string, any> = {}
    ): Promise<QRCode> {
        const reference = ReferenceGenerator.generateQRReference();

        const qrCode = await db.one(
            `INSERT INTO molam_transfer_qr_codes 
       (user_id, wallet_id, qr_type, amount, currency, reference, metadata)
       VALUES ($1, $2, 'dynamic', $3, $4, $5, $6)
       RETURNING *`,
            [userId, walletId, amount, currency, reference, metadata]
        );

        return qrCode;
    }

    static async generateStaticQR(
        userId: string,
        walletId: string,
        metadata: Record<string, any> = {}
    ): Promise<QRCode> {
        const reference = ReferenceGenerator.generateQRReference();

        const qrCode = await db.one(
            `INSERT INTO molam_transfer_qr_codes 
       (user_id, wallet_id, qr_type, reference, metadata)
       VALUES ($1, $2, 'static', $3, $4)
       RETURNING *`,
            [userId, walletId, reference, metadata]
        );

        return qrCode;
    }

    static async processQRTransfer(
        qrReference: string,
        senderId: string,
        senderWalletId: string,
        amount?: number
    ): Promise<any> {
        const qrCode = await db.one(
            `SELECT * FROM molam_transfer_qr_codes 
       WHERE reference = $1 AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())`,
            [qrReference]
        );

        if (!qrCode) {
            throw new Error('Invalid or expired QR code');
        }

        // Use QR code amount if not provided
        const transferAmount = amount || qrCode.amount;
        if (!transferAmount) {
            throw new Error('Amount required for this QR transfer');
        }

        // Create transfer using existing service
        // This would call TransferService.createTransfer with appropriate parameters
        return {
            qr_code: qrCode,
            transfer_created: true,
            receiver_wallet_id: qrCode.wallet_id,
            amount: transferAmount,
            currency: qrCode.currency
        };
    }
}