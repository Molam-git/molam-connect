export type Channel = 'inapp' | 'push' | 'sms' | 'email' | 'ussd';

export interface NotificationEvent {
    eventKey: string;
    userId: string;
    locale: string;
    currency: string;
    timeZone?: string;
    idempotencyKey?: string;
    renderVars: Record<string, unknown>;
    preferredChannels?: Channel[];
    siraPriority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface Template {
    templateId: number;
    eventKey: string;
    channel: Channel;
    locale: string;
    subjectTemplate?: string;
    bodyTemplate: string;
    version: number;
}

export interface Preference {
    userId: string;
    eventKey: string;
    channel: Channel;
    optedIn: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    dnd: boolean;
}

export interface OutboxRecord {
    outboxId: number;
    userId: string;
    eventKey: string;
    payloadJson: unknown;
    channels: Channel[];
    attemptCount: number;
    maxAttempts: number;
    status: 'PENDING' | 'SENT' | 'PARTIAL' | 'FAILED' | 'DLQ';
    idempotencyKey?: string;
    availableAt: string;
}