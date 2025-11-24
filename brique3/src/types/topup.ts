export type TopupChannel = 'mobile_money' | 'card' | 'agent' | 'crypto';
export type TopupStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface TopupCreateRequest {
    wallet_id: string;
    channel: TopupChannel;
    country_code: string;
    currency: string;
    amount: number;
    provider_hint?: string;
    metadata?: Record<string, any>;
}

export interface TopupResponse {
    id: string;
    user_id: string;
    wallet_id: string;
    provider_id: string;
    channel: TopupChannel;
    country_code: string;
    currency: string;
    amount: number;
    fee_amount: number;
    agent_commission: number;
    status: TopupStatus;
    reference: string;
    idempotency_key: string;
    initiated_via: string;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface PaymentProvider {
    id: string;
    name: string;
    type: TopupChannel;
    country_code: string;
    currency: string;
    active: boolean;
    config: ProviderConfig;
}

export interface ProviderConfig {
    fee_pct?: number;
    fee_fixed?: number;
    min_amount?: number;
    max_amount?: number;
    webhook_url?: string;
    credentials_ref: string;
}

export interface KYCLimits {
    country_code: string;
    currency: string;
    kyc_level: string;
    per_tx_max: number;
    daily_max: number;
    monthly_max: number;
}