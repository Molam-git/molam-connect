import { pool } from '../utils/db';

/**
 * Generate tax report for a jurisdiction and period
 */
export async function generateTaxReport(
  jurisdictionId: string,
  periodStart: string,
  periodEnd: string,
  format: 'csv' | 'json' | 'xml' = 'csv'
): Promise<string> {
  console.log(
    `[TaxWorker] Generating ${format} report for jurisdiction ${jurisdictionId} from ${periodStart} to ${periodEnd}`
  );

  // Fetch tax decisions for the period
  const { rows } = await pool.query(
    `SELECT
      td.*,
      tj.code as jurisdiction_code,
      tj.name as jurisdiction_name
     FROM tax_decisions td
     JOIN tax_jurisdictions tj ON tj.id = td.jurisdiction_id
     WHERE td.jurisdiction_id = $1
       AND td.computed_at::date BETWEEN $2 AND $3
     ORDER BY td.computed_at`,
    [jurisdictionId, periodStart, periodEnd]
  );

  if (format === 'csv') {
    return generateCSVReport(rows);
  } else if (format === 'json') {
    return JSON.stringify(rows, null, 2);
  } else if (format === 'xml') {
    return generateXMLReport(rows);
  }

  throw new Error(`Unsupported format: ${format}`);
}

/**
 * Generate CSV format report
 */
function generateCSVReport(rows: any[]): string {
  const header = [
    'tx_id',
    'merchant_id',
    'buyer_country',
    'total_tax',
    'currency',
    'jurisdiction_code',
    'computed_at',
    'rules_applied',
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    const rulesApplied = Array.isArray(row.rules_applied)
      ? row.rules_applied.map((r: any) => r.code).join('|')
      : '';

    lines.push(
      [
        row.connect_tx_id,
        row.merchant_id || '',
        row.buyer_country || '',
        row.total_tax,
        row.currency,
        row.jurisdiction_code,
        row.computed_at.toISOString(),
        rulesApplied,
      ].join(',')
    );
  }

  return lines.join('\n');
}

/**
 * Generate XML format report
 */
function generateXMLReport(rows: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<tax_report>\n';

  for (const row of rows) {
    xml += '  <transaction>\n';
    xml += `    <tx_id>${escapeXml(row.connect_tx_id)}</tx_id>\n`;
    xml += `    <merchant_id>${escapeXml(row.merchant_id || '')}</merchant_id>\n`;
    xml += `    <buyer_country>${escapeXml(row.buyer_country || '')}</buyer_country>\n`;
    xml += `    <total_tax>${row.total_tax}</total_tax>\n`;
    xml += `    <currency>${row.currency}</currency>\n`;
    xml += `    <computed_at>${row.computed_at.toISOString()}</computed_at>\n`;
    xml += '  </transaction>\n';
  }

  xml += '</tax_report>';

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Save report to database
 */
export async function saveTaxReport(
  jurisdictionId: string,
  periodStart: string,
  periodEnd: string,
  format: string,
  content: string
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO tax_reports(jurisdiction_id, period_start, period_end, format, status, row_count)
     VALUES ($1, $2, $3, $4, 'prepared', $5)
     RETURNING id`,
    [jurisdictionId, periodStart, periodEnd, format, content.split('\n').length - 1]
  );

  const reportId = rows[0].id;

  // In production, upload to S3 and store s3_key
  // For now, we just store in DB
  console.log(`[TaxWorker] Report saved with ID: ${reportId}`);

  return reportId;
}

/**
 * Main worker function to generate and save reports
 */
export async function runTaxReportWorker(): Promise<void> {
  console.log('[TaxWorker] Starting tax report worker...');

  try {
    // Get all jurisdictions
    const { rows: jurisdictions } = await pool.query(`SELECT * FROM tax_jurisdictions`);

    // Generate monthly reports for last month
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    for (const jurisdiction of jurisdictions) {
      console.log(`[TaxWorker] Processing ${jurisdiction.code} for ${periodStart} to ${periodEnd}`);

      const report = await generateTaxReport(jurisdiction.id, periodStart, periodEnd, 'csv');

      await saveTaxReport(jurisdiction.id, periodStart, periodEnd, 'csv', report);

      console.log(`[TaxWorker] ✓ Report generated for ${jurisdiction.code}`);
    }

    console.log('[TaxWorker] All reports generated successfully');
  } catch (error) {
    console.error('[TaxWorker] Error generating reports:', error);
    throw error;
  }
}

// Run worker if executed directly
if (require.main === module) {
  runTaxReportWorker()
    .then(() => {
      console.log('[TaxWorker] Worker completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[TaxWorker] Worker failed:', error);
      process.exit(1);
    });
}
