import { q } from "../db.js";
import type { NotificationChannel } from "./engine.js";

export interface RenderInput {
    templateCode: string;
    channel: NotificationChannel;
    locale: string;
    variables: Record<string, any>;
}

export interface RenderedTemplate {
    subject: string;
    body: string;
    version: number;
}

function pickLang(obj: any, locale: string, fallback = "en"): string {
    if (!obj) return "";
    return obj[locale] ?? obj[fallback] ?? Object.values(obj)[0] ?? "";
}

export async function renderTemplate(input: RenderInput): Promise<RenderedTemplate> {
    const { rows } = await q(`
    SELECT subject, body, version FROM notification_templates
    WHERE code=$1 AND channel=$2 AND is_active=true
    ORDER BY version DESC LIMIT 1
  `, [input.templateCode, input.channel]);

    if (!rows.length) {
        throw new Error(`template_not_found: ${input.templateCode} for channel ${input.channel}`);
    }

    const tpl = rows[0];
    const subject = pickLang(tpl.subject, input.locale);
    const body = pickLang(tpl.body, input.locale);

    const compiledSubject = interpolate(subject, input.variables);
    const compiledBody = interpolate(body, input.variables);

    return {
        subject: compiledSubject,
        body: compiledBody,
        version: tpl.version
    };
}

export function interpolate(str: string, vars: Record<string, any>): string {
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
        const value = key.split('.').reduce((acc: any, part: string) => {
            return acc != null ? acc[part] : undefined;
        }, vars);
        return value != null ? String(value) : `{{${key}}}`;
    });
}