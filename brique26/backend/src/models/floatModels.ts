// Interfaces TypeScript pour le modèle de données Float

export interface FloatEntity {
    id: number;
    entity_type: 'agent' | 'bank' | 'mmo';
    ref_id: string;
    country: string;
    currency: string;
    display_name: string;
    status: 'active' | 'paused';
    meta: Record<string, any>;
    created_at?: Date;
}

export interface FloatPosition {
    entity_id: number;
    as_of: Date;
    balance: number;
    reserved: number;
    available: number;
    currency: string;
}

export interface FloatRule {
    entity_id: number;
    min_level: number;
    target_level: number;
    max_level: number;
    daily_growth_bp: number;
    volatility_bp: number;
    lead_minutes: number;
    updated_at: Date;
}

export interface FloatForecast {
    entity_id: number;
    horizon_min: number;
    forecast_avail: number;
    created_at: Date;
}

export interface FloatTransfer {
    id: number;
    plan_id: string;
    from_entity_id: number;
    to_entity_id: number;
    amount: number;
    currency: string;
    reason: 'replenish' | 'collect' | 'settlement';
    status: 'planned' | 'sent' | 'confirmed' | 'failed' | 'canceled';
    eta_minutes: number;
    external_ref?: string;
    created_by?: number;
    created_at: Date;
    updated_at: Date;
}

export interface FloatAlert {
    id: number;
    entity_id: number;
    alert_type: 'low_liquidity' | 'breach' | 'min_violation' | 'volatility' | 'fraud_pattern';
    severity: 'info' | 'warn' | 'critical';
    message: string;
    created_at: Date;
    acknowledged: boolean;
    acknowledged_by?: number;
    acknowledged_at?: Date;
}

// Types pour les réponses API
export interface PositionWithStatus extends FloatPosition {
    entity_name: string;
    entity_type: string;
    min_level: number;
    target_level: number;
    max_level: number;
    status: 'critical' | 'normal' | 'surplus';
}

export interface TransferWithEntities extends FloatTransfer {
    from_entity_name: string;
    to_entity_name: string;
    from_entity_type: string;
    to_entity_type: string;
}