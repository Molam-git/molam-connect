export interface User {
    id: string;
    roles: string[];
    country: string;
    currency: string;
    lang: string;
}

export interface BankTransfer {
    id: string;
    direction: 'IN' | 'OUT';
    user_id: number;
    wallet_id: number;
    partner_id: number;
    rail_code: string;
    amount: number;
    currency: string;
    status: string;
}

export interface Fees {
    bank_fee: number;
    molam_fee: number;
    total_fee: number;
}