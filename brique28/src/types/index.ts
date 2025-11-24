// src/types/index.ts
export interface Notification {
    id: string;
    user_id?: string;
    agent_id?: number;
    channel: 'sms' | 'email' | 'push' | 'voice';
    zone_code: string;
    language: string;
    currency: string;
    payload: any;
    provider_attempts: ProviderAttempt[];
    status: 'pending' | 'delivered' | 'failed' | 'aborted';
    priority: number;
    next_attempt_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface ProviderAttempt {
    provider: string;
    ts: string;
    result: 'success' | 'fail';
    latency_ms: number;
    cost: number;
    raw: any;
}

export interface NotificationZone {
    zone_code: string;
    prefer_sms: boolean;
    prefer_email: boolean;
    max_backoff_sec: number;
    max_retries: number;
    min_fee: number;
    max_fee: number;
    pricing_markup_pct: number;
    updated_at: Date;
}

export interface NotificationProvider {
    id: string;
    name: string;
    channel: string;
    zone_code?: string;
    priority: number;
    base_cost: number;
    currency: string;
    is_active: boolean;
    config: any;
    created_at: Date;
    updated_at: Date;
}

export interface SiraEvent {
    notification_id: string;
    result: 'delivered' | 'failed';
    latency_ms?: number;
    cost?: number;
    provider: string;
    fallback_used: boolean;
    attempts?: ProviderAttempt[];
    zone?: string;
}