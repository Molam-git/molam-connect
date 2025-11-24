import { Request } from 'express';

export interface Template {
    id: string;
    template_key: string;
    channel: 'sms' | 'email' | 'push' | 'ussd' | 'voice';
    lang: string;
    version: number;
    content: string;
    metadata: {
        subject?: string;
        ttl?: number;
        voice_gender?: 'male' | 'female';
        [key: string]: any;
    };
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

export interface TemplateRenderRequest {
    key: string;
    lang?: string;
    channel?: string;
    variables: Record<string, string | number>;
}

export interface AuditLog {
    id: number;
    template_id: string;
    action: 'created' | 'updated' | 'activated' | 'deactivated';
    actor_id?: string;
    snapshot: Template;
    created_at: string;
}

export interface User {
    id: string;
    roles: string[];
}

// Extension de l'interface Request d'Express
export interface AuthRequest extends Request {
    user?: User;
}