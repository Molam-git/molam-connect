import { Template, TemplateCreateRequest } from '../types/templates';

const API_BASE = '/api';

export const templateAPI = {
    async listTemplates(key?: string): Promise<Template[]> {
        const url = key ? `${API_BASE}/templates?key=${encodeURIComponent(key)}` : `${API_BASE}/templates`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch templates');
        return response.json();
    },

    async renderTemplate(
        key: string,
        lang: string,
        channel: string,
        variables: Record<string, string | number>
    ): Promise<any> {
        const params = new URLSearchParams({ lang, channel, ...variables as any });
        const response = await fetch(`${API_BASE}/templates/${key}/render?${params}`);
        if (!response.ok) throw new Error('Failed to render template');
        return response.json();
    },

    async createTemplate(templateData: TemplateCreateRequest): Promise<Template> {
        const response = await fetch(`${API_BASE}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });
        if (!response.ok) throw new Error('Failed to create template');
        return response.json();
    },

    async activateTemplate(templateId: string): Promise<void> {
        const response = await fetch(`${API_BASE}/templates/${templateId}/activate`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to activate template');
    }
};