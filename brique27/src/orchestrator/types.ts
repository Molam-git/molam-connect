export interface WalletEvent {
    event_id: string;
    event_type: string;
    actor_user_id?: number;
    counterparty_user_id?: number;
    agent_user_id?: number;
    target_user_ids?: number[];
    amount: number;
    currency: string;
    country: string;
    txn_ref: string;
    invoice_number?: string;
    settlement_ref?: string;
    alert_message?: string;
    fee_molam?: number;
    // ... other event-specific fields
}

export interface UserContext {
    userId: number;
    lang: string;
    currency: string;
    country: string;
    tz: string;
    phone: string;
    email: string;
    pushToken: string | null;
    prefs: UserPrefs;
}

export interface UserPrefs {
    push_enabled: boolean;
    sms_enabled: boolean;
    email_enabled: boolean;
    ussd_enabled: boolean;
    quiet_hours: { start: string; end: string };
}

export interface RenderedTemplate {
    channel: string;
    subject?: string;
    body: string;
    payload: any;
}

export interface OutboxItem {
    event_id: string;
    user_id: number;
    event_type: string;
    channel: string;
    lang: string;
    currency: string;
    payload: any;
    rendered_subject?: string;
    rendered_body: string;
}