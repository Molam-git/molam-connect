// types/transactionTypes.ts
export interface TransactionRequest {
    debit_wallet_id: string;
    credit_wallet_id: string;
    amount: number;
    currency: string;
    txn_type: 'recharge' | 'withdraw' | 'p2p' | 'merchant_payment' | 'bill' | 'topup' | 'refund' | 'reward' | 'commission';
    initiated_by: string;
    module_origin: 'pay' | 'eats' | 'shop' | 'ads' | 'talk' | 'free';
    metadata?: any;
}

export interface ConfirmTransactionRequest {
    confirmed_by: string;
}

export interface TransactionResponse {
    transaction: any;
    message: string;
}

export interface WalletTransaction {
    id: string;
    debit_wallet_id: string;
    credit_wallet_id: string;
    amount: number;
    currency: string;
    txn_type: string;
    status: 'pending' | 'success' | 'failed' | 'cancelled';
    reference: string;
    initiated_by: string;
    module_origin: string;
    created_at: string;
    confirmed_at?: string;
    signature: string;
    sira_score: number;
    metadata?: any;
}