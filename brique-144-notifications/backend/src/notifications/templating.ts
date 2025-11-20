/**
 * BRIQUE 144 — Template Resolution and Rendering
 * Multi-tenant fallback chain: tenant-specific → global → en
 */
import { pool } from "./db";
import mustache from "mustache";

export async function resolveTemplate(params: {
  tenant_type: string;
  tenant_id?: string;
  key: string;
  lang: string;
}) {
  const { tenant_type, tenant_id, key, lang } = params;

  // 1. Try tenant-specific template
  if (tenant_id) {
    const { rows } = await pool.query(
      `SELECT * FROM notif_templates
       WHERE tenant_type=$1 AND tenant_id=$2 AND key=$3 AND lang=$4 AND status='active'
       ORDER BY version DESC LIMIT 1`,
      [tenant_type, tenant_id, key, lang]
    );
    if (rows.length) return rows[0];
  }

  // 2. Try global template with same language
  const { rows: globalRows } = await pool.query(
    `SELECT * FROM notif_templates
     WHERE tenant_type='global' AND key=$1 AND lang=$2 AND status='active'
     ORDER BY version DESC LIMIT 1`,
    [key, lang]
  );
  if (globalRows.length) return globalRows[0];

  // 3. Fallback to English
  const { rows: enRows } = await pool.query(
    `SELECT * FROM notif_templates
     WHERE tenant_type='global' AND key=$1 AND lang='en' AND status='active'
     ORDER BY version DESC LIMIT 1`,
    [key]
  );
  if (enRows.length) return enRows[0];

  // 4. Fallback to French
  const { rows: frRows } = await pool.query(
    `SELECT * FROM notif_templates
     WHERE tenant_type='global' AND key=$1 AND lang='fr' AND status='active'
     ORDER BY version DESC LIMIT 1`,
    [key]
  );
  if (frRows.length) return frRows[0];

  throw new Error(`template_not_found: ${key} (lang: ${lang})`);
}

export function renderTemplate(template: any, params: Record<string, any>) {
  const subject = template.subject ? mustache.render(template.subject, params) : null;
  const bodyText = template.body_text ? mustache.render(template.body_text, params) : null;
  const bodyHtml = template.body_html ? mustache.render(template.body_html, params) : null;

  return { subject, bodyText, bodyHtml };
}
