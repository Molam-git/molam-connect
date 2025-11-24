// src/types/topup.ts
export interface TelecomOperator {
    id: string;
    name: string;
    country_code: string;
    provider_type: string;
    api_endpoint?: string;
    aggregator_code?: string;
    currency: string;
    commission_rate: number;
    status: string;
    created_at: Date;
}

export interface TopupProduct {
    id: string;
    operator_id: string;
    product_code: string;
    description: string;
    amount: number;
    currency: string;
    validity_days?: number;
    is_active: boolean;
    created_at: Date;
}

export interface TopupTransaction {
    id: string;
    user_id: string;
    operator_id: string;
    product_id?: string;
    phone_number: string;
    amount: number;
    currency: string;
    fx_rate?: number;
    status: 'pending' | 'confirmed' | 'failed' | 'refunded';
    sira_score?: number;
    fee_total: number;
    fee_breakdown: any;
    provider_reference?: string;
    created_at: Date;
    confirmed_at?: Date;
    failed_at?: Date;
    refunded_at?: Date;
}

export interface CreateTopupRequest {
    operator_id: string;
    product_id: string;
    phone_number: string;
    currency: string;
}

export interface CreateTopupResponse {
    transaction_id: string;
    status: string;
    preview: {
        amount: string;
        fees: { molam: number; partner: number };
        total: string;
    };
}

export interface WebhookPayload {
    transaction_id: string;
    status: 'confirmed' | 'failed';
    provider_reference: string;
    timestamp: string;
    signature: string;
}