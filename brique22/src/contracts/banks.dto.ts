export type Direction = 'deposit' | 'withdraw';

export interface QuoteRequest {
    direction: Direction;
    bankCode?: string;            // optional explicit bank
    amount: number;               // before fees, in currency
    currency: string;             // ISO 4217
    fromCountry: string;          // ISO-3166
    toCountry: string;            // ISO-3166
}

export interface QuoteResponse {
    routeId: number;
    bankName: string;
    rail: string;
    currency: string;
    amount: number;
    feeBankFixed: number;
    feeBankPercent: number;
    feeMolamFixed: number;
    feeMolamPercent: number;
    feeTotal: number;
    amountNet: number;
    etaSeconds: number;
    breakdown: {
        bank: number;
        molam: number;
    };
    policyNotes?: string[];
}

export interface ExecuteRequest {
    quote: QuoteResponse;
    userId: number;
    walletId: number;
    beneficiary?: {
        name?: string;
        iban?: string;
        accountNumber?: string;
        bankCode?: string;
    };
}

export interface ExecuteResponse {
    orderUuid: string;
    status: 'pending' | 'processing' | 'succeeded' | 'failed';
    externalRef?: string;
}