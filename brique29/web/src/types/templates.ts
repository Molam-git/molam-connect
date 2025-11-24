export interface Template {
    id: string;
    template_key: string;
    channel: 'sms' | 'email' | 'push' | 'ussd' | 'voice';
    lang: string;
    version: number;
    content: string;
    metadata: Record<string, any>;
    is_active: boolean;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface TemplateCreateRequest {
    template_key: string;
    channel: 'sms' | 'email' | 'push' | 'ussd' | 'voice';
    lang: string;
    content: string;
    metadata?: Record<string, any>;
}