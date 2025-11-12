/**
 * Evidence Service - Auto-generate dispute evidence packages
 */
import { pool } from "../utils/db.js";

export interface EvidenceTemplate {
  id: string;
  name: string;
  description?: string;
  template_type: string;
  template_json: any;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  template_type: string;
  template_json: any;
  created_by: string;
}

/**
 * Create evidence template
 */
export async function createTemplate(input: CreateTemplateInput): Promise<EvidenceTemplate> {
  const { rows: [template] } = await pool.query<EvidenceTemplate>(
    `INSERT INTO evidence_templates (name, description, template_type, template_json, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.description || null, input.template_type, input.template_json, input.created_by]
  );

  return template;
}

/**
 * Get template by ID
 */
export async function getTemplate(templateId: string): Promise<EvidenceTemplate | null> {
  const { rows } = await pool.query<EvidenceTemplate>(
    "SELECT * FROM evidence_templates WHERE id = $1",
    [templateId]
  );
  return rows.length ? rows[0] : null;
}

/**
 * List all templates
 */
export async function listTemplates(): Promise<EvidenceTemplate[]> {
  const { rows } = await pool.query<EvidenceTemplate>(
    "SELECT * FROM evidence_templates ORDER BY created_at DESC"
  );
  return rows;
}

/**
 * Generate evidence package for a payment
 */
export async function generateEvidencePackage(
  paymentId: string,
  templateId: string
): Promise<any> {
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error("template_not_found");
  }

  // Load payment signal
  const { rows } = await pool.query(
    "SELECT * FROM payment_signals WHERE payment_id = $1",
    [paymentId]
  );
  if (!rows.length) {
    throw new Error("payment_signal_not_found");
  }

  const signal = rows[0];

  // Generate evidence based on template
  const evidence: any = {
    template_id: templateId,
    template_name: template.name,
    payment_id: paymentId,
    generated_at: new Date().toISOString(),
    sections: [],
  };

  // Process template sections
  const sections = template.template_json.sections || [];
  for (const section of sections) {
    const sectionData: any = {
      type: section.type,
      title: section.title,
      data: {},
    };

    // Populate section data based on type
    switch (section.type) {
      case "receipt":
        sectionData.data = {
          amount: signal.amount,
          currency: signal.currency,
          payment_id: paymentId,
          merchant_id: signal.merchant_id,
          date: signal.created_at,
        };
        break;
      case "tracking":
        sectionData.data = {
          tracking_number: signal.shipping_info?.tracking_number || "N/A",
          shipping_country: signal.shipping_info?.country || "N/A",
          shipping_city: signal.shipping_info?.city || "N/A",
        };
        break;
      case "device":
        sectionData.data = {
          device_id: signal.device_fingerprint?.id || "N/A",
          device_type: signal.device_fingerprint?.type || "N/A",
          ip_address: signal.ip_address || "N/A",
          geo: signal.geo || {},
        };
        break;
      case "velocity":
        sectionData.data = signal.velocity || {};
        break;
      default:
        sectionData.data = {};
    }

    evidence.sections.push(sectionData);
  }

  return evidence;
}
