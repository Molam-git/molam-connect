export interface User {
    id: string;
    merchant_id?: string;
    scopes: string[];
    roles: string[];
    country_code?: string;
}

export interface Transaction {
    id: string;
    created_at: string;
    updated_at: string;
    tx_type: 'p2p' | 'qr' | 'bill' | 'deposit' | 'withdraw' | 'checkout';
    status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';
    user_id: string;
    merchant_id?: string;
    counterparty_id?: string;
    amount: string;
    currency: string;
    country_code: string;
    channel: 'ma' | 'connect' | 'ussd' | 'app' | 'web';
    reference: string;
    molam_fee?: number;
    partner_fee?: number;
    agent_share?: number;
    reward_confirmed?: number;
    reward_pending?: number;
    reward_clawback?: number;
    refunded_amount?: number;
    risk_score?: number;
    flags?: string[];
}

export interface PaginationInfo {
    has_more: boolean;
    next_before_ts: string | null;
    next_before_id: string | null;
}

export interface HistoryResponse {
    items: Transaction[];
    page: PaginationInfo;
}

declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}