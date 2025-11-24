// src/types/transfer.ts

export type TransferStatus =
    | 'created'
    | 'pending'
    | 'confirmed'
    | 'succeeded'
    | 'cancelled'
    | 'failed';

export type InitiatedVia =
    | 'app'
    | 'web'
    | 'ussd'
    | 'qr_dynamic'
    | 'qr_static';

export interface Transfer {
    id: string;
    sender_id: string;
    sender_wallet_id: string;
    receiver_id: string;
    receiver_wallet_id: string;
    currency: string;
    amount: number;
    fee_amount: number;
    status: TransferStatus;
    reference: string;
    idempotency_key: string;
    initiated_via: InitiatedVia;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface TransferCreateRequest {
    sender_wallet_id: string;
    receiver_wallet_id: string;
    currency: string;
    amount: number;
    metadata?: Record<string, any>;
}

export interface TransferEvent {
    id: string;
    transfer_id: string;
    event_type: string;
    raw_payload: Record<string, any>;
    created_at: Date;
}

export interface QRCode {
    id: string;
    user_id: string;
    wallet_id: string;
    qr_type: 'dynamic' | 'static';
    amount?: number;
    currency?: string;
    reference: string;
    is_active: boolean;
    metadata: Record<string, any>;
    expires_at?: Date;
    created_at: Date;
}

export interface SIRAEvaluation {
    decision: 'allow' | 'review' | 'block';
    risk_score: number;
    reasons: string[];
    rules_triggered: string[];
}