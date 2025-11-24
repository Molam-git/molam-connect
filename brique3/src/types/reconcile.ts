export interface PaymentProvider {
    id: string;
    name: string;
    type: string;
    country_code: string;
    currency: string;
    active: boolean;
    config: any;
}

export interface ReconciliationResult {
    provider_id: string;
    currency: string;
    day: string;
    expected_amount: number;
    actual_amount: number;
    discrepancy: number;
    status: 'matched' | 'discrepancy' | 'missing';
}

export interface ProviderSettlement {
    total_amount: number;
    transaction_count: number;
    fees: number;
    settlement_reference: string;
}

// Ajouter l'interface pour les données internes de settlement
export interface InternalSettlementSummary {
    provider_id: string;
    currency: string;
    day: string;
    total_gross: number;
    total_fees: number;
    total_agent_comm: number;
    count_succeeded: number;
}

// Interface pour les tickets de reconciliation
export interface ReconciliationTicket {
    provider_id: string;
    currency: string;
    settlement_date: string;
    internal_amount: number;
    external_amount: number;
    discrepancy: number;
    status: string;
}