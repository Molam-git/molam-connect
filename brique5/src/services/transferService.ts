// src/services/transferService.ts
import { db } from '../utils/db';
import { ReferenceGenerator } from '../utils/referenceGenerator';
import {
    Transfer,
    TransferCreateRequest,
    TransferStatus
} from '../types/transfer';
import { transferConfig } from '../config/transferConfig';

export class TransferService {
    static async createTransfer(
        request: TransferCreateRequest,
        senderId: string,
        idempotencyKey: string,
        initiatedVia: string
    ): Promise<Transfer> {
        return await db.tx(async (client) => {
            // Verify sender wallet ownership
            const senderWallet = await client.query(
                `SELECT * FROM molam_wallets WHERE id = $1 AND user_id = $2`,
                [request.sender_wallet_id, senderId]
            );

            if (senderWallet.rows.length === 0) {
                throw new Error('Sender wallet not found or access denied');
            }

            // Get receiver wallet
            const receiverWallet = await client.query(
                `SELECT * FROM molam_wallets WHERE id = $1`,
                [request.receiver_wallet_id]
            );

            if (receiverWallet.rows.length === 0) {
                throw new Error('Receiver wallet not found');
            }

            const sender = senderWallet.rows[0];
            const receiver = receiverWallet.rows[0];

            // Currency validation
            if (sender.currency !== request.currency || receiver.currency !== request.currency) {
                throw new Error('Currency mismatch');
            }

            // Balance check
            if (Number(sender.balance) < Number(request.amount)) {
                throw new Error('Insufficient balance');
            }

            // KYC limits check
            const kycCheck = await this.checkKYCLimits(
                senderId,
                sender.country_code,
                request.currency,
                request.amount
            );

            if (!kycCheck.allowed) {
                throw new Error(`Transfer limit exceeded: ${kycCheck.reason}`);
            }

            // Create transfer
            const reference = ReferenceGenerator.generateTransferReference();
            const transfer = await client.query(
                `INSERT INTO molam_transfers 
         (sender_id, sender_wallet_id, receiver_id, receiver_wallet_id, 
          currency, amount, fee_amount, status, reference, idempotency_key, initiated_via, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
                [
                    senderId,
                    request.sender_wallet_id,
                    receiver.user_id,
                    request.receiver_wallet_id,
                    request.currency,
                    request.amount,
                    0, // fee_amount - could be calculated based on transfer type
                    'pending',
                    reference,
                    idempotencyKey,
                    initiatedVia,
                    request.metadata || {}
                ]
            );

            // Log event
            await client.query(
                `INSERT INTO molam_transfer_events (transfer_id, event_type, raw_payload)
         VALUES ($1, 'created', $2)`,
                [transfer.rows[0].id, { amount: request.amount, currency: request.currency }]
            );

            return transfer.rows[0];
        });
    }

    static async confirmTransfer(transferId: string, userId: string): Promise<Transfer> {
        return await db.tx(async (client) => {
            const transfer = await client.query(
                `SELECT * FROM molam_transfers 
         WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
         FOR UPDATE`,
                [transferId, userId]
            );

            if (transfer.rows.length === 0) {
                throw new Error('Transfer not found or cannot be confirmed');
            }

            // Update transfer status
            const updated = await client.query(
                `UPDATE molam_transfers 
         SET status = 'succeeded', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
                [transferId]
            );

            // Post to ledger
            await client.query('SELECT post_transfer_ledger($1)', [transferId]);

            // Log event
            await client.query(
                `INSERT INTO molam_transfer_events (transfer_id, event_type, raw_payload)
         VALUES ($1, 'confirmed', $2)`,
                [transferId, { confirmed_by: userId }]
            );

            return updated.rows[0];
        });
    }

    static async cancelTransfer(transferId: string, userId: string): Promise<Transfer> {
        const transfer = await db.oneOrNone(
            `SELECT * FROM molam_transfers 
       WHERE id = $1 AND sender_id = $2 AND status = 'pending'`,
            [transferId, userId]
        );

        if (!transfer) {
            throw new Error('Transfer not found or cannot be cancelled');
        }

        // Check cancellation window
        const createdAt = new Date(transfer.created_at);
        const now = new Date();
        const minutesDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60);

        if (minutesDiff > transferConfig.cancellationWindow) {
            throw new Error('Cancellation window expired');
        }

        const cancelled = await db.one(
            `UPDATE molam_transfers 
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [transferId]
        );

        // Log event
        await db.none(
            `INSERT INTO molam_transfer_events (transfer_id, event_type, raw_payload)
       VALUES ($1, 'cancelled', $2)`,
            [transferId, { cancelled_by: userId }]
        );

        return cancelled;
    }

    private static async checkKYCLimits(
        userId: string,
        countryCode: string,
        currency: string,
        amount: number
    ): Promise<{ allowed: boolean; reason?: string }> {
        const user = await db.one(
            `SELECT kyc_level FROM molam_users WHERE id = $1`,
            [userId]
        );

        const limit = await db.oneOrNone(
            `SELECT * FROM molam_kyc_limits 
       WHERE country_code = $1 AND currency = $2 AND kyc_level = $3`,
            [countryCode, currency, user.kyc_level || 'P0']
        );

        if (!limit) {
            return { allowed: true }; // No limits defined for this level
        }

        if (amount > Number(limit.per_tx_max)) {
            return {
                allowed: false,
                reason: `Exceeds per-transaction limit of ${limit.per_tx_max}`
            };
        }

        // Check daily limit
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const dailyTotal = await db.one(
            `SELECT COALESCE(SUM(amount), 0) as total
       FROM molam_transfers 
       WHERE sender_id = $1 AND status = 'succeeded' AND created_at >= $2`,
            [userId, todayStart]
        );

        if (Number(dailyTotal.total) + amount > Number(limit.daily_max)) {
            return {
                allowed: false,
                reason: `Exceeds daily limit of ${limit.daily_max}`
            };
        }

        return { allowed: true };
    }
}