import { pool } from '../db';

const ALLOWED_VARIABLES = new Set([
    'amount', 'currency', 'user_name', 'transaction_id', 'balance',
    'date', 'time', 'merchant', 'location', 'phone', 'email'
]);

export function renderTemplate(content: string, vars: Record<string, string | number>): string {
    return content.replace(/\$\{(\w+)\}/g, (_, key) => {
        if (!ALLOWED_VARIABLES.has(key)) {
            return `\$\{${key}\}`; // Leave unknown variables as-is for security
        }
        return vars[key] !== undefined ? String(vars[key]) : `\$\{${key}\}`;
    });
}

export function validateTemplateVariables(content: string): string[] {
    const variables: string[] = [];
    const matches = content.matchAll(/\$\{(\w+)\}/g);

    for (const match of matches) {
        variables.push(match[1]);
    }

    const invalidVars = variables.filter(v => !ALLOWED_VARIABLES.has(v));
    return invalidVars;
}

export async function getActiveTemplate(
    templateKey: string,
    lang: string,
    channel: string
): Promise<any> {
    // Try requested language first
    let query = `
    SELECT * FROM notification_templates 
    WHERE template_key = $1 AND lang = $2 AND channel = $3 AND is_active = true 
    ORDER BY version DESC LIMIT 1
  `;

    let result = await pool.query(query, [templateKey, lang, channel]);

    // Fallback to English if not found
    if (result.rows.length === 0 && lang !== 'en') {
        result = await pool.query(query, [templateKey, 'en', channel]);
    }

    return result.rows[0];
}