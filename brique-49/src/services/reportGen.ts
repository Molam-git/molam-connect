/**
 * Brique 49 - Taxes & Compliance
 * Fiscal Report Generation Service
 */

import { pool } from "../utils/db.js";
import { putS3WORM } from "../utils/s3.js";
import { auditLog } from "../utils/audit.js";
import { format } from "date-fns";

export interface ReportOptions {
  legalEntity: string;
  reportType: "vat_return" | "withholding_summary" | "tax_statement";
  periodStart: Date;
  periodEnd: Date;
  country: string;
  format?: "csv" | "xml" | "pdf";
  requestedBy: string;
}

/**
 * Generate VAT return report
 */
export async function generateVatReturn(options: ReportOptions): Promise<any> {
  const { legalEntity, country, periodStart, periodEnd, requestedBy } = options;

  // Collect tax_lines for legal entity & period
  const { rows } = await pool.query(
    `SELECT
      tax_code,
      SUM(taxable_amount) as taxable_total,
      SUM(tax_amount) as tax_total,
      currency,
      COUNT(*) as transaction_count
     FROM tax_lines
     WHERE legal_entity = $1
       AND country = $2
       AND computed_at::date BETWEEN $3 AND $4
       AND tax_code LIKE 'VAT%'
     GROUP BY tax_code, currency
     ORDER BY tax_code`,
    [legalEntity, country, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)]
  );

  // Generate CSV
  const header = "tax_code,currency,taxable_total,tax_total,transaction_count\n";
  const body = rows
    .map(
      (r) =>
        `${r.tax_code},${r.currency},${Number(r.taxable_total).toFixed(2)},${Number(r.tax_total).toFixed(2)},${r.transaction_count}`
    )
    .join("\n");

  const csv = header + body;

  // Calculate totals for metadata
  const totals = rows.reduce(
    (acc, r) => {
      acc.taxable_total += Number(r.taxable_total);
      acc.tax_total += Number(r.tax_total);
      acc.transaction_count += Number(r.transaction_count);
      return acc;
    },
    { taxable_total: 0, tax_total: 0, transaction_count: 0 }
  );

  // Store in S3 WORM
  const key = `fiscal_reports/${legalEntity}/${country}/${format(periodStart, "yyyyMMdd")}_${format(periodEnd, "yyyyMMdd")}_vat_return.csv`;
  await putS3WORM(key, Buffer.from(csv, "utf8"));

  // Insert fiscal_reports row
  const { rows: [report] } = await pool.query(
    `INSERT INTO fiscal_reports(
      legal_entity, report_type, period_start, period_end, country,
      file_s3_key, file_format, status, metadata, created_by, created_at
    ) VALUES ($1, 'vat_return', $2, $3, $4, $5, 'csv', 'generated', $6, $7, now())
    RETURNING *`,
    [
      legalEntity,
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
      country,
      key,
      { totals, row_count: rows.length },
      requestedBy,
    ]
  );

  // Audit log
  await auditLog({
    action: "fiscal_report.generate",
    actor_id: requestedBy,
    resource_type: "fiscal_report",
    resource_id: report.id,
    details: { report_type: "vat_return", legal_entity: legalEntity, period_start: periodStart, period_end: periodEnd },
  });

  return report;
}

/**
 * Generate withholding summary report
 */
export async function generateWithholdingSummary(options: ReportOptions): Promise<any> {
  const { legalEntity, country, periodStart, periodEnd, requestedBy } = options;

  // Collect withholding records
  const { rows } = await pool.query(
    `SELECT
      target_entity_type,
      target_entity_id,
      tax_code,
      SUM(base_amount) as base_total,
      SUM(withheld_amount) as withheld_total,
      currency,
      status,
      COUNT(*) as record_count
     FROM withholding_records
     WHERE legal_entity = $1
       AND country = $2
       AND created_at::date BETWEEN $3 AND $4
     GROUP BY target_entity_type, target_entity_id, tax_code, currency, status
     ORDER BY withheld_total DESC`,
    [legalEntity, country, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)]
  );

  // Generate CSV
  const header = "entity_type,entity_id,tax_code,currency,base_total,withheld_total,status,record_count\n";
  const body = rows
    .map(
      (r) =>
        `${r.target_entity_type},${r.target_entity_id},${r.tax_code},${r.currency},${Number(r.base_total).toFixed(2)},${Number(r.withheld_total).toFixed(2)},${r.status},${r.record_count}`
    )
    .join("\n");

  const csv = header + body;

  // Store in S3 WORM
  const key = `fiscal_reports/${legalEntity}/${country}/${format(periodStart, "yyyyMMdd")}_${format(periodEnd, "yyyyMMdd")}_withholding_summary.csv`;
  await putS3WORM(key, Buffer.from(csv, "utf8"));

  // Insert fiscal_reports row
  const { rows: [report] } = await pool.query(
    `INSERT INTO fiscal_reports(
      legal_entity, report_type, period_start, period_end, country,
      file_s3_key, file_format, status, metadata, created_by, created_at
    ) VALUES ($1, 'withholding_summary', $2, $3, $4, $5, 'csv', 'generated', $6, $7, now())
    RETURNING *`,
    [
      legalEntity,
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
      country,
      key,
      { row_count: rows.length },
      requestedBy,
    ]
  );

  // Audit log
  await auditLog({
    action: "fiscal_report.generate",
    actor_id: requestedBy,
    resource_type: "fiscal_report",
    resource_id: report.id,
    details: {
      report_type: "withholding_summary",
      legal_entity: legalEntity,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });

  return report;
}

/**
 * Generate comprehensive tax statement
 */
export async function generateTaxStatement(options: ReportOptions): Promise<any> {
  const { legalEntity, country, periodStart, periodEnd, requestedBy } = options;

  // Collect all tax data
  const { rows: taxLines } = await pool.query(
    `SELECT * FROM tax_lines
     WHERE legal_entity = $1
       AND country = $2
       AND computed_at::date BETWEEN $3 AND $4
     ORDER BY computed_at`,
    [legalEntity, country, periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10)]
  );

  // Generate detailed CSV
  const header = "date,source_table,source_id,tax_code,taxable_amount,tax_rate,tax_amount,currency\n";
  const body = taxLines
    .map(
      (r) =>
        `${r.computed_at.toISOString().slice(0, 10)},${r.source_table},${r.source_id},${r.tax_code},${Number(r.taxable_amount).toFixed(2)},${Number(r.tax_rate).toFixed(4)},${Number(r.tax_amount).toFixed(2)},${r.currency}`
    )
    .join("\n");

  const csv = header + body;

  // Store in S3 WORM
  const key = `fiscal_reports/${legalEntity}/${country}/${format(periodStart, "yyyyMMdd")}_${format(periodEnd, "yyyyMMdd")}_tax_statement.csv`;
  await putS3WORM(key, Buffer.from(csv, "utf8"));

  // Insert fiscal_reports row
  const { rows: [report] } = await pool.query(
    `INSERT INTO fiscal_reports(
      legal_entity, report_type, period_start, period_end, country,
      file_s3_key, file_format, status, metadata, created_by, created_at
    ) VALUES ($1, 'tax_statement', $2, $3, $4, $5, 'csv', 'generated', $6, $7, now())
    RETURNING *`,
    [
      legalEntity,
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
      country,
      key,
      { transaction_count: taxLines.length },
      requestedBy,
    ]
  );

  // Audit log
  await auditLog({
    action: "fiscal_report.generate",
    actor_id: requestedBy,
    resource_type: "fiscal_report",
    resource_id: report.id,
    details: { report_type: "tax_statement", legal_entity: legalEntity, period_start: periodStart, period_end: periodEnd },
  });

  return report;
}
