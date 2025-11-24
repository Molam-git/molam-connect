export interface User {
    id: string;
    language: string;
    country: string;
    phone: string;
    region?: string;
    first_name?: string;
}

export interface NotificationTemplate {
    id: string;
    template_key: string;
    channel: string;
    lang: string;
    content: string;
    is_active: boolean;
    version: number;
}

export interface TtsProvider {
    id: string;
    name: string;
    endpoint: string;
    api_key_encrypted: string;
    per_minute_usd: number;
    supported_langs: string[];
    regions_supported: string[];
    is_active: boolean;
}

export interface VoiceChannelRule {
    id: number;
    region?: string;
    country?: string;
    city?: string;
    fallback_enabled: boolean;
    fallback_delay_seconds: number;
    max_message_seconds: number;
    budget_daily_usd: number;
    budget_monthly_usd: number;
    allowed_hours: string;
    preferred_providers: string[];
    updated_by?: string;
    updated_at: Date;
}

export interface NotificationDelivery {
    id: string;
    user_id: string;
    template_id: string;
    channel: string;
    provider?: string;
    provider_request_id?: string;
    status: string;
    fail_reason?: string;
    cost_usd: number;
    attempts: number;
    last_attempt_at?: Date;
    created_at: Date;
    delivered_at?: Date;
    country?: string;
    region?: string;
    city?: string;
    currency: string;
    rule_id?: number;
}