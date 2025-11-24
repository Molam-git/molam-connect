export type AccountKind = 'BANK_ROUTE' | 'AGENT_POOL' | 'CENTRAL';

export interface RebalancePlan {
    srcAccountId: number;
    dstAccountId: number;
    currency: string;
    amount: number;
    reason: 'HARD_FLOOR' | 'CEILING' | 'SCHEDULE' | 'MANUAL';
    siraScore: number;
    costEstimate: number;
}

export interface FloatAccount {
    id: number;
    kind: AccountKind;
    ref_id: number | null;
    currency: string;
    name: string;
    country_code: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface FloatBalance {
    account_id: number;
    balance_available: number;
    balance_reserved: number;
    updated_at: Date;
}

export interface FloatPolicy {
    account_id: number;
    min_target: number;
    max_target: number;
    hard_floor: number;
    hard_ceiling: number;
    daily_withdraw_cap: number;
    allow_outbound: boolean;
    allow_inbound: boolean;
    updated_at: Date;
}