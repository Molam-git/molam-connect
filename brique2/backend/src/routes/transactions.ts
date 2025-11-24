// routes/transactions.ts - Version corrigée sans returns problématiques
import { Router, Request, Response } from "express";
import db from "../db";
import { v4 as uuidv4 } from "uuid";
import { authenticateJWT, authorizeRole } from "../middleware/auth";
import { validateTransaction, validateTransactionConfirmation } from "../middleware/transactionValidation";
import { TransactionRequest, TransactionResponse, ConfirmTransactionRequest } from "../types/transactionTypes";
import { signTransaction, sendToSira, logAudit, verifyBalanceWithClient } from "../services/transactionService";

const router = Router();

/**
 * CREATE - Créer une nouvelle transaction double-entry
 * POST /api/pay/transactions
 */
router.post("/api/pay/transactions",
    authenticateJWT,
    authorizeRole(['user', 'merchant', 'admin']),
    validateTransaction,
    async (req: Request<{}, {}, TransactionRequest>, res: Response) => {
        const client = await db.connect();

        try {
            const {
                debit_wallet_id,
                credit_wallet_id,
                amount,
                currency,
                txn_type,
                initiated_by,
                module_origin,
                metadata
            } = req.body;

            const reference = `PAY-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

            await client.query('BEGIN');

            // ✅ OPTIONNEL : Utiliser la version avec client pour plus de cohérence
            const hasSufficientBalance = await verifyBalanceWithClient(client, debit_wallet_id, amount, currency);
            if (!hasSufficientBalance) {
                await client.query('ROLLBACK');
                client.done();
                res.status(400).json({
                    error: "Solde insuffisant",
                    code: "INSUFFICIENT_BALANCE"
                });
                return;// Simple return sans valeur
            }

            // Scoring Sira en temps réel
            const siraResponse = await sendToSira({
                debit_wallet_id,
                credit_wallet_id,
                amount,
                currency,
                txn_type,
                reference,
                metadata
            });

            if (siraResponse.risk_score > 70) {
                await client.query('ROLLBACK');
                client.done();
                res.status(403).json({
                    error: "Transaction bloquée pour des raisons de sécurité",
                    code: "HIGH_RISK_TRANSACTION",
                    sira_score: siraResponse.risk_score
                });
                return; // Simple return sans valeur
            }

            // Signature de la transaction
            const signature = signTransaction({
                debit_wallet_id,
                credit_wallet_id,
                amount,
                currency,
                txn_type,
                reference,
                timestamp: new Date().toISOString()
            });

            // Insertion de la transaction
            const txn = await client.one(
                `INSERT INTO molam_wallet_transactions 
         (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, 
          reference, initiated_by, module_origin, signature, sira_score, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
                [
                    debit_wallet_id, credit_wallet_id, amount, currency, txn_type, 'pending',
                    reference, initiated_by, module_origin, signature, siraResponse.risk_score,
                    metadata || null
                ]
            );

            await client.query('COMMIT');

            // Audit log
            await logAudit({
                action: 'TRANSACTION_CREATED',
                user_id: initiated_by,
                transaction_id: txn.id,
                details: { txn_type, amount, currency, reference }
            });

            const response: TransactionResponse = {
                transaction: txn,
                message: "Transaction créée avec succès, en attente de confirmation"
            };

            res.status(201).json(response);
            // Pas besoin de return ici

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Transaction creation failed:", err);

            res.status(500).json({
                error: "Échec de la création de la transaction",
                code: "TRANSACTION_CREATION_FAILED"
            });
            // Pas besoin de return ici
        } finally {
            client.done();
        }
    }
);

/**
 * CONFIRM - Confirmer une transaction (success)
 * POST /api/pay/transactions/:id/confirm
 */
router.post("/api/pay/transactions/:id/confirm",
    authenticateJWT,
    authorizeRole(['user', 'merchant', 'admin', 'system']),
    validateTransactionConfirmation,
    async (req: Request<{ id: string }, {}, ConfirmTransactionRequest>, res: Response) => {
        const { id } = req.params;
        const { confirmed_by } = req.body;

        const client = await db.connect();

        try {
            await client.query('BEGIN');

            const txn = await client.oneOrNone(
                `UPDATE molam_wallet_transactions 
         SET status = 'success', confirmed_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
                [id]
            );

            if (!txn) {
                await client.query('ROLLBACK');
                client.done();
                res.status(404).json({
                    error: "Transaction non trouvée ou déjà traitée",
                    code: "TRANSACTION_NOT_FOUND"
                });
                return; // Simple return sans valeur
            }

            // Mise à jour des soldes des wallets
            await client.query(
                `UPDATE molam_wallets 
         SET balance = balance - $1, updated_at = NOW()
         WHERE id = $2 AND currency = $3`,
                [txn.amount, txn.debit_wallet_id, txn.currency]
            );

            await client.query(
                `UPDATE molam_wallets 
         SET balance = balance + $1, updated_at = NOW()
         WHERE id = $2 AND currency = $3`,
                [txn.amount, txn.credit_wallet_id, txn.currency]
            );

            await client.query('COMMIT');

            // Audit log
            await logAudit({
                action: 'TRANSACTION_CONFIRMED',
                user_id: confirmed_by,
                transaction_id: txn.id,
                details: { confirmed_at: new Date().toISOString() }
            });

            const response: TransactionResponse = {
                transaction: txn,
                message: "Transaction confirmée avec succès"
            };

            res.json(response);
            // Pas besoin de return ici

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Transaction confirmation failed:", err);

            res.status(500).json({
                error: "Échec de la confirmation de la transaction",
                code: "CONFIRMATION_FAILED"
            });
            // Pas besoin de return ici
        } finally {
            client.done();
        }
    }
);

/**
 * GET - Récupérer une transaction par ID
 * GET /api/pay/transactions/:id
 */
router.get("/api/pay/transactions/:id",
    authenticateJWT,
    async (req: Request<{ id: string }>, res: Response) => {
        const { id } = req.params;

        try {
            const txn = await db.oneOrNone(
                `SELECT * FROM molam_wallet_transactions WHERE id = $1`,
                [id]
            );

            if (!txn) {
                res.status(404).json({
                    error: "Transaction non trouvée",
                    code: "TRANSACTION_NOT_FOUND"
                });
                return; // Simple return sans valeur
            }

            res.json({ transaction: txn });
            // Pas besoin de return ici

        } catch (err) {
            console.error("Transaction fetch failed:", err);
            res.status(500).json({
                error: "Erreur lors de la récupération de la transaction"
            });
            // Pas besoin de return ici
        }
    }
);

/**
 * LIST - Lister les transactions d'un wallet
 * GET /api/pay/wallets/:walletId/transactions
 */
router.get("/api/pay/wallets/:walletId/transactions",
    authenticateJWT,
    async (req: Request<{ walletId: string }>, res: Response) => {
        const { walletId } = req.params;
        const { page = 1, limit = 50, txn_type, status } = req.query;

        const offset = (Number(page) - 1) * Number(limit);

        try {
            let query = `
        SELECT * FROM molam_wallet_transactions 
        WHERE (debit_wallet_id = $1 OR credit_wallet_id = $1)
      `;
            let params: any[] = [walletId];
            let paramCount = 1;

            if (txn_type) {
                paramCount++;
                query += ` AND txn_type = $${paramCount}`;
                params.push(txn_type);
            }

            if (status) {
                paramCount++;
                query += ` AND status = $${paramCount}`;
                params.push(status);
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
            params.push(Number(limit), offset);

            const transactions = await db.any(query, params);

            res.json({
                transactions,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    has_more: transactions.length === Number(limit)
                }
            });
            // Pas besoin de return ici

        } catch (err) {
            console.error("Transactions list fetch failed:", err);
            res.status(500).json({
                error: "Erreur lors de la récupération des transactions"
            });
            // Pas besoin de return ici
        }
    }
);

export default router;