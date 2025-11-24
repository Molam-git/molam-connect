// middleware/transactionValidation.ts
import { Request, Response, NextFunction } from 'express';
import { TransactionRequest, ConfirmTransactionRequest } from '../types/transactionTypes';

const SUPPORTED_CURRENCIES = ['XOF', 'USD', 'EUR', 'GBP'];
const TRANSACTION_TYPES = ['recharge', 'withdraw', 'p2p', 'merchant_payment', 'bill', 'topup', 'refund', 'reward', 'commission'];
const MODULE_ORIGINS = ['pay', 'eats', 'shop', 'ads', 'talk', 'free'];

export function validateTransaction(
    req: Request<{}, {}, TransactionRequest>,
    res: Response,
    next: NextFunction
): void {
    const {
        debit_wallet_id,
        credit_wallet_id,
        amount,
        currency,
        txn_type,
        module_origin
    } = req.body;

    const errors: string[] = [];

    // Validation des champs requis
    if (!debit_wallet_id) errors.push("debit_wallet_id est requis");
    if (!credit_wallet_id) errors.push("credit_wallet_id est requis");
    if (!amount || amount <= 0) errors.push("amount doit être positif");
    if (!currency) errors.push("currency est requis");
    if (!txn_type) errors.push("txn_type est requis");
    if (!module_origin) errors.push("module_origin est requis");

    // Validation des valeurs
    if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
        errors.push(`Devise non supportée: ${currency}`);
    }

    if (txn_type && !TRANSACTION_TYPES.includes(txn_type)) {
        errors.push(`Type de transaction invalide: ${txn_type}`);
    }

    if (module_origin && !MODULE_ORIGINS.includes(module_origin)) {
        errors.push(`Module d'origine invalide: ${module_origin}`);
    }

    if (debit_wallet_id && credit_wallet_id && debit_wallet_id === credit_wallet_id) {
        errors.push("Le wallet débité et crédité ne peuvent pas être identiques");
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: "Validation failed",
            details: errors
        });
        return;
    }

    next();
}

export function validateTransactionConfirmation(
    req: Request<{ id: string }, {}, ConfirmTransactionRequest>,
    res: Response,
    next: NextFunction
): void {
    const { id } = req.params;
    const { confirmed_by } = req.body;

    const errors: string[] = [];

    if (!id) errors.push("Transaction ID est requis");
    if (!confirmed_by) errors.push("confirmed_by est requis");

    // Validation UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (id && !uuidRegex.test(id)) {
        errors.push("Format d'ID de transaction invalide");
    }

    if (errors.length > 0) {
        res.status(400).json({
            error: "Validation failed",
            details: errors
        });
        return;
    }

    next();
}