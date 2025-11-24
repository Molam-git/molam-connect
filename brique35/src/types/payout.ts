export interface PayoutCreateRequest {
    origin_module: string;
    origin_entity_id: string;
    amount: number;
    currency: string;
    beneficiary: Beneficiary;
    scheduled_for?: string;
    priority?: number;
}

export interface PayoutResponse {
    id: string;
    reference_code: string;
    status: string;
    amount: number;
    currency: string;
    total_deducted: number;
    requires_approval: boolean;
}

export interface Beneficiary {
    name: string;
    account_number: string;
    bank_code?: string;
    bank_name?: string;
    iban?: string;
    swift_bic?: string;
    type: 'individual' | 'business';
}

export interface BankResponse {
    status: 'sent' | 'failed' | 'pending';
    provider_ref?: string;
    error_message?: string;
    raw_response?: any;
}