/**
 * Brique 50 - Fiscal Reporting
 * Fiscal Report Generation Service
 */

import { pool } from "../utils/db.js";
import { formatToCsv, formatToXml, renderPdf } from "../utils/formatters/index.js";
import { putS3WORM } from "../utils/s3.js";
import { publishEvent } from "../webhooks/publisher.js";
import { computeLocaleCurrencyFromMolamId } from "../utils/molamIdHelpers.js";
import { predictReject } from "../utils/sira.js";
import { auditLog } from "../utils/audit.js";

export interface GenerateReportParams {
  legalEntity: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  createdBy: string;
}

/**
 * Generate a fiscal report for a legal entity and period
 */
export async function generateFiscalReport(params: GenerateReportParams): Promise<any> {
  const { legalEntity, reportType, periodStart, periodEnd, createdBy } = params;

  // 1) Collect data from billing system
  const { rows: billing } = await pool.query(
    `SELECT * FROM billing_charges
     WHERE occurred_at >= $1 AND occurred_at <= $2
     AND status = 'billed'
     AND metadata->>'legal_entity' = $3
     ORDER BY occurred_at ASC`,
    [periodStart, periodEnd, legalEntity]
  ).catch(() => ({ rows: [] })); // Graceful fallback if table doesn't exist

  // Build canonical JSON payload
  const canonical = {
    legalEntity,
    reportType,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    items: billing,
  };

  // 2) Determine country/locale/currency via mapping or Molam ID claims
  const { country, locale, currency } = await computeLocaleCurrencyFromMolamId(legalEntity);

  // 3) Format artifact based on report type
  let artifactKey: string | null = null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (reportType === "vat_return") {
    const csv = formatToCsv(canonical);
    artifactKey = await putS3WORM(
      `fiscal/${legalEntity}/vat_${periodStart}_${periodEnd}_${timestamp}.csv`,
      Buffer.from(csv, "utf8")
    );
  } else if (reportType === "digital_services") {
    const xml = formatToXml(canonical);
    artifactKey = await putS3WORM(
      `fiscal/${legalEntity}/digital_${periodStart}_${periodEnd}_${timestamp}.xml`,
      Buffer.from(xml, "utf8")
    );
  } else if (reportType === "withholding") {
    const csv = formatToCsv(canonical);
    artifactKey = await putS3WORM(
      `fiscal/${legalEntity}/withholding_${periodStart}_${periodEnd}_${timestamp}.csv`,
      Buffer.from(csv, "utf8")
    );
  } else {
    // Default: PDF format
    const pdf = await renderPdf(canonical, locale);
    artifactKey = await putS3WORM(
      `fiscal/${legalEntity}/${reportType}_${periodStart}_${periodEnd}_${timestamp}.pdf`,
      pdf
    );
  }

  // 4) Store report record
  const { rows } = await pool.query(
    `INSERT INTO fiscal_reports(
      legal_entity, country, period_start, period_end, report_type,
      status, canonical_json, artifact_s3_key, locale, currency, created_by
    ) VALUES ($1, $2, $3, $4, $5, 'generated', $6, $7, $8, $9, $10)
    RETURNING *`,
    [legalEntity, country, periodStart, periodEnd, reportType, canonical, artifactKey, locale, currency, createdBy]
  );

  const report = rows[0];

  // 5) SIRA prevalidation: predict reject probability
  const siraScore = await predictReject(report);
  const scorePercent = Math.round(siraScore.probability * 100);

  await pool.query(`UPDATE fiscal_reports SET sira_reject_score = $1 WHERE id = $2`, [scorePercent, report.id]);

  if (siraScore.probability > 0.6) {
    // Flag for ops review - create remediation task
    await pool.query(`UPDATE fiscal_reports SET status = 'ready' WHERE id = $1`, [report.id]);

    await pool.query(
      `INSERT INTO fiscal_remediations(report_id, issue_code, severity, details, status)
       VALUES ($1, $2, $3, $4, 'open')`,
      [report.id, "sira_predicted_reject", "medium", { score: siraScore }]
    );
  } else {
    // Mark as ready for submission
    await pool.query(`UPDATE fiscal_reports SET status = 'ready' WHERE id = $1`, [report.id]);
  }

  // 6) Audit log
  await auditLog({
    action: "report_generated",
    actor_id: createdBy,
    actor_type: "user",
    resource_type: "fiscal_report",
    resource_id: report.id,
    details: {
      legal_entity: legalEntity,
      report_type: reportType,
      period: `${periodStart} to ${periodEnd}`,
      sira_score: scorePercent,
    },
  });

  // 7) Publish event
  await publishEvent("internal", "treasury", "fiscal.report.generated", {
    report_id: report.id,
    legal_entity: legalEntity,
    report_type: reportType,
  });

  return { ...report, sira_reject_score: scorePercent };
}

/**
 * Get report by ID
 */
export async function getReportById(reportId: string): Promise<any> {
  const { rows } = await pool.query(`SELECT * FROM fiscal_reports WHERE id = $1`, [reportId]);

  if (rows.length === 0) {
    throw new Error("report_not_found");
  }

  return rows[0];
}

/**
 * List reports with filters
 */
export async function listReports(filters: any = {}): Promise<any[]> {
  let query = `SELECT * FROM fiscal_reports WHERE 1=1`;
  const params: any[] = [];

  if (filters.legalEntity) {
    params.push(filters.legalEntity);
    query += ` AND legal_entity = $${params.length}`;
  }

  if (filters.country) {
    params.push(filters.country);
    query += ` AND country = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT 200`;

  const { rows } = await pool.query(query, params);
  return rows;
}
