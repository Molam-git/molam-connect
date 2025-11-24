// services/transactionService.ts
import crypto from 'crypto';
import db from '../db';

const HMAC_SECRET = process.env.TRANSACTION_HMAC_SECRET || 'molam-pay-secret-key';

export interface SiraPayload {
    debit_wallet_id: string;
    credit_wallet_id: string;
    amount: number;
    currency: string;
    txn_type: string;
    reference: string;
    metadata?: any;
}

export interface SiraResponse {
    risk_score: number;
    flags: string[];
    recommendation: 'ALLOW' | 'REVIEW' | 'BLOCK';
}

export interface AuditLog {
    action: string;
    user_id: string;
    transaction_id: string;
    details: any;
}

/**
 * Signer une transaction avec HMAC/SHA256
 */
export function signTransaction(transactionData: any): string {
    const dataString = JSON.stringify(transactionData);
    return crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(dataString)
        .digest('hex');
}

/**
 * Vérifier la signature d'une transaction
 */
export function verifySignature(transactionData: any, signature: string): boolean {
    const expectedSignature = signTransaction(transactionData);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Vérifier le solde du wallet
 */
export async function verifyBalance(
    walletId: string,
    amount: number,
    currency: string
): Promise<boolean> {
    try {
        const wallet = await db.one(
            `SELECT balance FROM molam_wallets 
       WHERE id = $1 AND currency = $2`,
            [walletId, currency]
        );

        return wallet.balance >= amount;
    } catch (err) {
        console.error("Balance verification failed:", err);
        return false;
    }
}

/**
 * Vérifier le solde avec un client spécifique (pour les transactions)
 */
export async function verifyBalanceWithClient(
    client: any,
    walletId: string,
    amount: number,
    currency: string
): Promise<boolean> {
    try {
        const wallet = await client.one(
            `SELECT balance FROM molam_wallets 
       WHERE id = $1 AND currency = $2`,
            [walletId, currency]
        );

        return wallet.balance >= amount;
    } catch (err) {
        console.error("Balance verification failed:", err);
        return false;
    }
}

/**
 * Envoyer à Sira pour scoring risque
 */
export async function sendToSira(payload: SiraPayload): Promise<SiraResponse> {
    // Simulation de l'intégration Sira
    // En production, ce serait un appel HTTP à l'API Sira

    const baseScore = Math.floor(Math.random() * 100);

    // Règles métier simples pour le scoring
    let riskScore = baseScore;
    const flags: string[] = [];

    // Règle: Transactions importantes
    if (payload.amount > 100000) {
        riskScore += 15;
        flags.push('HIGH_AMOUNT');
    }

    // Règle: Fréquence des transactions (à implémenter avec historique)
    // Règle: Wallet suspect (à implémenter avec blacklist)

    let recommendation: 'ALLOW' | 'REVIEW' | 'BLOCK' = 'ALLOW';
    if (riskScore > 70) recommendation = 'BLOCK';
    else if (riskScore > 40) recommendation = 'REVIEW';

    return {
        risk_score: Math.min(riskScore, 100),
        flags,
        recommendation
    };
}

/**
 * Logger dans molam_audit_logs
 */
export async function logAudit(auditLog: AuditLog): Promise<void> {
    try {
        await db.none(
            `INSERT INTO molam_audit_logs 
       (action, user_id, transaction_id, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
            [auditLog.action, auditLog.user_id, auditLog.transaction_id, auditLog.details]
        );
    } catch (err) {
        console.error("Audit log failed:", err);
        // Ne pas bloquer le flux principal en cas d'échec d'audit
    }
}

/**
 * Annuler une transaction (seulement si pending)
 */
export async function cancelTransaction(transactionId: string, cancelledBy: string): Promise<boolean> {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const txn = await client.oneOrNone(
            `UPDATE molam_wallet_transactions 
       SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
            [transactionId]
        );

        if (!txn) {
            await client.query('ROLLBACK');
            client.done(); // CORRECTION: utiliser done() au lieu de release()
            return false;
        }

        await logAudit({
            action: 'TRANSACTION_CANCELLED',
            user_id: cancelledBy,
            transaction_id: transactionId,
            details: { cancelled_at: new Date().toISOString() }
        });

        await client.query('COMMIT');
        client.done(); // CORRECTION: utiliser done() au lieu de release()
        return true;

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction cancellation failed:", err);
        client.done(); // CORRECTION: utiliser done() au lieu de release()
        return false;
    }
}

/**
 * Rembourser une transaction
 */
export async function refundTransaction(
    originalTransactionId: string,
    refundedBy: string,
    amount?: number
): Promise<boolean> {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Récupérer la transaction originale
        const originalTxn = await client.one(
            `SELECT * FROM molam_wallet_transactions WHERE id = $1 AND status = 'success'`,
            [originalTransactionId]
        );

        if (!originalTxn) {
            await client.query('ROLLBACK');
            client.done(); // CORRECTION
            return false;
        }

        const refundAmount = amount || originalTxn.amount;
        const reference = `REFUND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Créer la transaction de remboursement (inverser débit/crédit)
        const refundTxn = await client.one(
            `INSERT INTO molam_wallet_transactions 
       (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, 
        reference, initiated_by, module_origin, metadata)
       VALUES ($1, $2, $3, $4, 'refund', 'pending', $5, $6, $7, $8)
       RETURNING *`,
            [
                originalTxn.credit_wallet_id, // Le bénéficiaire original rembourse
                originalTxn.debit_wallet_id,  // Le payeur original est remboursé
                refundAmount,
                originalTxn.currency,
                reference,
                refundedBy,
                originalTxn.module_origin,
                { original_transaction_id: originalTransactionId }
            ]
        );

        await client.query('COMMIT');

        await logAudit({
            action: 'TRANSACTION_REFUNDED',
            user_id: refundedBy,
            transaction_id: refundTxn.id,
            details: {
                original_transaction_id: originalTransactionId,
                refund_amount: refundAmount
            }
        });

        client.done(); // CORRECTION
        return true;

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction refund failed:", err);
        client.done(); // CORRECTION
        return false;
    }
}

/**
 * Obtenir l'historique des transactions d'un wallet
 */
export async function getWalletTransactionHistory(
    walletId: string,
    limit: number = 50,
    offset: number = 0
): Promise<any[]> {
    try {
        const transactions = await db.any(
            `SELECT * FROM molam_wallet_transactions 
       WHERE debit_wallet_id = $1 OR credit_wallet_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
            [walletId, limit, offset]
        );

        return transactions;
    } catch (err) {
        console.error("Transaction history fetch failed:", err);
        return [];
    }
}

/**
 * Calculer les statistiques d'un wallet
 */
export async function getWalletStats(walletId: string): Promise<any> {
    try {
        const stats = await db.one(
            `SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_transactions,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
        SUM(CASE WHEN debit_wallet_id = $1 AND status = 'success' THEN amount ELSE 0 END) as total_debit,
        SUM(CASE WHEN credit_wallet_id = $1 AND status = 'success' THEN amount ELSE 0 END) as total_credit
       FROM molam_wallet_transactions
       WHERE debit_wallet_id = $1 OR credit_wallet_id = $1`,
            [walletId]
        );

        return stats;
    } catch (err) {
        console.error("Wallet stats fetch failed:", err);
        return {
            total_transactions: 0,
            successful_transactions: 0,
            pending_transactions: 0,
            failed_transactions: 0,
            total_debit: 0,
            total_credit: 0
        };
    }
}