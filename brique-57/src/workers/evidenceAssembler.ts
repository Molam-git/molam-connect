import { pool } from '../utils/db';
import fetch from 'node-fetch';

/**
 * Evidence Assembler Worker
 * Automatically assembles evidence packages for new disputes using templates
 */

const POLL_INTERVAL = 30000; // 30 seconds
const SIRA_URL = process.env.SIRA_URL || 'http://localhost:8044';

interface Dispute {
  id: string;
  merchant_id: string;
  payment_id: string;
  reason_code: string;
  amount: number;
  currency: string;
  network: string;
  created_at: string;
}

interface PaymentDetails {
  id: string;
  merchant_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  card_last4: string;
  card_brand: string;
  created_at: string;
  metadata: any;
}

/**
 * Fetch payment details from B34
 */
async function fetchPaymentDetails(paymentId: string): Promise<PaymentDetails | null> {
  try {
    const response = await fetch(`${process.env.PAYMENTS_URL || 'http://localhost:8034'}/api/payments/${paymentId}`);
    if (!response.ok) return null;
    return await response.json() as PaymentDetails;
  } catch (error) {
    console.error(`[EvidenceAssembler] Error fetching payment ${paymentId}:`, error);
    return null;
  }
}

/**
 * Fetch SIRA fraud analysis for payment
 */
async function fetchSiraAnalysis(paymentId: string): Promise<any> {
  try {
    const response = await fetch(`${SIRA_URL}/api/sira/analyze/${paymentId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`[EvidenceAssembler] Error fetching SIRA analysis:`, error);
    return null;
  }
}

/**
 * Get evidence template for reason code
 */
function getTemplateForReasonCode(reasonCode: string): string[] {
  const templates: Record<string, string[]> = {
    '10.4': ['proof_of_delivery', 'shipping_receipt', 'customer_communication'], // Fraud / Card-Absent
    '13.1': ['invoice', 'product_description', 'terms_of_service'], // Services Not Provided
    '13.2': ['cancellation_policy', 'customer_communication', 'service_logs'], // Cancelled Recurring
    '13.3': ['product_description', 'terms_of_service', 'proof_of_delivery'], // Not as Described
    '13.5': ['invoice', 'product_description', 'payment_confirmation'], // Misrepresentation
    '13.7': ['cancellation_policy', 'refund_policy', 'customer_communication'], // Cancelled Merchandise
    '83': ['proof_of_authorization', 'customer_communication', 'invoice'], // Fraud / Card-Present
  };

  return templates[reasonCode] || ['invoice', 'proof_of_delivery', 'customer_communication'];
}

/**
 * Auto-generate evidence package for dispute
 */
async function generateEvidencePackage(dispute: Dispute): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if evidence package already exists
    const { rows: existingPkgs } = await client.query(
      'SELECT id FROM evidence_packages WHERE dispute_id = $1',
      [dispute.id]
    );

    if (existingPkgs.length > 0) {
      console.log(`[EvidenceAssembler] Evidence package already exists for dispute ${dispute.id}`);
      await client.query('COMMIT');
      return;
    }

    // Fetch payment details
    const payment = await fetchPaymentDetails(dispute.payment_id);
    if (!payment) {
      console.error(`[EvidenceAssembler] Payment not found: ${dispute.payment_id}`);
      await client.query('ROLLBACK');
      return;
    }

    // Fetch SIRA analysis
    const siraAnalysis = await fetchSiraAnalysis(dispute.payment_id);

    // Get template for reason code
    const requiredDocuments = getTemplateForReasonCode(dispute.reason_code);

    // Create evidence package
    const { rows: pkgs } = await client.query(
      `INSERT INTO evidence_packages (merchant_id, dispute_id, package_type, status, documents)
       VALUES ($1, $2, 'chargeback_rebuttal', 'draft', '[]'::jsonb)
       RETURNING *`,
      [dispute.merchant_id, dispute.id]
    );

    const pkg = pkgs[0];

    // Generate evidence summary document
    const evidenceSummary = {
      id: crypto.randomUUID(),
      document_type: 'evidence_summary',
      file_name: 'evidence_summary.json',
      content: {
        dispute_id: dispute.id,
        reason_code: dispute.reason_code,
        amount: dispute.amount,
        currency: dispute.currency,
        payment_details: payment,
        sira_analysis: siraAnalysis,
        required_documents: requiredDocuments,
        generated_at: new Date().toISOString(),
      },
      generated: true,
      uploaded_at: new Date().toISOString(),
    };

    // Add summary to package
    await client.query(
      `UPDATE evidence_packages
       SET documents = documents || $1::jsonb
       WHERE id = $2`,
      [JSON.stringify(evidenceSummary), pkg.id]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evidence_package', pkg.id, 'auto_generate', 'system', JSON.stringify({ dispute_id: dispute.id, reason_code: dispute.reason_code }), dispute.merchant_id]
    );

    await client.query('COMMIT');

    console.log(`[EvidenceAssembler] Generated evidence package ${pkg.id} for dispute ${dispute.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[EvidenceAssembler] Error generating evidence package:`, error);
  } finally {
    client.release();
  }
}

/**
 * Process new disputes without evidence packages
 */
async function processNewDisputes(): Promise<void> {
  const { rows } = await pool.query<Dispute>(
    `SELECT d.* FROM disputes d
     LEFT JOIN evidence_packages ep ON ep.dispute_id = d.id
     WHERE ep.id IS NULL
       AND d.status IN ('pending', 'under_review')
       AND d.created_at >= NOW() - INTERVAL '30 days'
     ORDER BY d.created_at ASC
     LIMIT 50`
  );

  console.log(`[EvidenceAssembler] Found ${rows.length} disputes without evidence packages`);

  for (const dispute of rows) {
    await generateEvidencePackage(dispute);
  }
}

/**
 * Main worker loop
 */
async function run(): Promise<void> {
  console.log('[EvidenceAssembler] Worker started');

  setInterval(async () => {
    try {
      await processNewDisputes();
    } catch (error) {
      console.error('[EvidenceAssembler] Error in worker loop:', error);
    }
  }, POLL_INTERVAL);

  // Run immediately on startup
  await processNewDisputes();
}

run().catch((error) => {
  console.error('[EvidenceAssembler] Fatal error:', error);
  process.exit(1);
});
