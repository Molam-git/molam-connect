// src/types/treasury.ts
export interface ContactInfo {
    email: string;
    phone: string;
    address: string;
}

export type PayoutStatus = 'pending' | 'processing' | 'sent' | 'settled' | 'failed' | 'reversed';

export interface SLA {
    cutoff_time: string;
    settlement_days: number;
}

export interface FeeStructure {
    [key: string]: {
        fixed: number;
        percent: number;
    };
}

export interface BankAccount {
    iban?: string;
    account_number?: string;
    bank_code?: string;
    beneficiary_name: string;
}

export interface BankRails {
    sepa: boolean;
    swift: boolean;
    local: string[];
}

// Les interfaces existantes restent
export interface BankProfile {
    id: string;
    name: string;
    country: string;
    currency_codes: string[];
    rails: BankRails;
    provider_type: 'bank' | 'psp' | 'gateway';
    compliance_level: 'onboarding' | 'verified' | 'blocked';
    legal_documents?: Record<string, any>;
    contact?: ContactInfo; // Maintenant défini
    sla?: SLA; // Maintenant défini
    fees?: FeeStructure; // Maintenant défini
    metadata?: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface Payout {
    id: string;
    external_id: string;
    origin_module: string;
    origin_entity_id: string;
    currency: string;
    amount: number;
    bank_account: BankAccount; // Maintenant défini
    // ... reste du code
}