export interface AgentInsurancePolicy {
    id: string;
    agent_id: number;
    policy_status: 'draft' | 'active' | 'cancelled' | 'lapsed';
    cover_pct: number;
    coverage_limit: number;
    premium_period: 'daily' | 'weekly' | 'monthly';
    premium_amount: number;
    currency: string;
    start_date: string;
    end_date: string;
    reinsurance_partner_id?: string;
    metadata: any;
    created_at: string;
    updated_at: string;
}

export interface AgentRiskScore {
    id: string;
    agent_id: number;
    score: number;
    factors: {
        volume?: number;
        volatility?: number;
        disputes?: number;
        uptime?: number;
        seasonality?: number;
    };
    computed_at: string;
}

export interface InsuranceClaim {
    id: string;
    policy_id: string;
    agent_id: number;
    claim_amount: number;
    currency: string;
    status: 'submitted' | 'investigating' | 'approved' | 'rejected' | 'paid';
    evidence: any;
    approved_at?: string;
    paid_at?: string;
    created_at: string;
    updated_at: string;
}