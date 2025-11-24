// src/services/ussdService.ts
import { TransferService } from './transferService';
import { db } from '../utils/db';

export class USSDService {
    static async processTransferRequest(
        msisdn: string,
        recipientMsisdn: string,
        amount: number,
        pin: string
    ): Promise<any> {
        // Verify PIN
        const pinValid = await this.verifyPIN(msisdn, pin);
        if (!pinValid) {
            throw new Error('Invalid PIN');
        }

        // Get user and wallet by MSISDN
        const sender = await db.one(
            `SELECT u.id as user_id, w.id as wallet_id, w.currency
       FROM molam_users u
       JOIN molam_wallets w ON u.id = w.user_id
       WHERE u.msisdn = $1 AND w.is_primary = true`,
            [msisdn]
        );

        const recipient = await db.one(
            `SELECT u.id as user_id, w.id as wallet_id, w.currency
       FROM molam_users u
       JOIN molam_wallets w ON u.id = w.user_id
       WHERE u.msisdn = $1 AND w.is_primary = true`,
            [recipientMsisdn]
        );

        // Create transfer
        const transfer = await TransferService.createTransfer(
            {
                sender_wallet_id: sender.wallet_id,
                receiver_wallet_id: recipient.wallet_id,
                currency: sender.currency,
                amount: amount,
                metadata: { initiated_via: 'ussd' }
            },
            sender.user_id,
            `ussd-${Date.now()}-${msisdn}`,
            'ussd'
        );

        return {
            transfer_reference: transfer.reference,
            status: transfer.status,
            message: 'Transfer initiated. Recipient needs to confirm.'
        };
    }

    static async confirmTransferUSSD(
        msisdn: string,
        transferReference: string
    ): Promise<any> {
        const user = await db.one(
            `SELECT id FROM molam_users WHERE msisdn = $1`,
            [msisdn]
        );

        const transfer = await db.one(
            `SELECT * FROM molam_transfers 
       WHERE reference = $1 AND receiver_id = $2`,
            [transferReference, user.id]
        );

        const confirmed = await TransferService.confirmTransfer(transfer.id, user.id);

        return {
            status: confirmed.status,
            message: 'Transfer confirmed successfully'
        };
    }

    private static async verifyPIN(msisdn: string, pin: string): Promise<boolean> {
        // Mock implementation - in production, verify against stored hash
        const user = await db.oneOrNone(
            `SELECT pin_hash FROM molam_users WHERE msisdn = $1`,
            [msisdn]
        );

        if (!user) return false;

        // Compare with hashed PIN (using bcrypt or similar in production)
        return user.pin_hash === this.hashPIN(pin);
    }

    private static hashPIN(pin: string): string {
        // Mock implementation - use proper hashing in production
        return Buffer.from(pin).toString('base64');
    }
}