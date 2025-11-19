// ============================================================================
// Regulatory Export Generator
// ============================================================================

import { Pool } from "pg";
import { generateChecksum } from "../utils/hmac";
import { logAuditEvent } from "./audit-logger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Generate regulatory export based on format
 */
export async function generateExport(jobId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get job details
    const { rows: [job] } = await client.query(
      `SELECT * FROM treasury_export_jobs WHERE id=$1 FOR UPDATE`,
      [jobId]
    );

    if (!job) throw new Error("Job not found");
    if (job.status !== 'pending') throw new Error("Job already processed");

    // Mark as running
    await client.query(
      `UPDATE treasury_export_jobs SET status='running', updated_at=now() WHERE id=$1`,
      [jobId]
    );

    await client.query("COMMIT");

    // Fetch audit logs for period
    const { rows: logs } = await pool.query(
      `SELECT * FROM treasury_audit_logs
       WHERE event_time BETWEEN $1 AND $2
       ORDER BY event_time ASC`,
      [job.period_start, job.period_end]
    );

    // Generate content based on format
    let content: string;
    let filename: string;

    switch (job.format) {
      case 'BCEAO_CSV':
        content = generateBCEAOCSV(logs);
        filename = `BCEAO_${job.period_start}_${job.period_end}.csv`;
        break;

      case 'BCE_XML':
        content = generateBCEXML(logs);
        filename = `BCE_${job.period_start}_${job.period_end}.xml`;
        break;

      case 'FED_JSON':
        content = generateFEDJSON(logs);
        filename = `FED_${job.period_start}_${job.period_end}.json`;
        break;

      case 'SEC_CSV':
        content = generateSECCSV(logs);
        filename = `SEC_${job.period_start}_${job.period_end}.csv`;
        break;

      default:
        content = JSON.stringify(logs, null, 2);
        filename = `export_${job.period_start}_${job.period_end}.json`;
    }

    // Calculate checksum
    const checksum = generateChecksum(content);

    // Upload to S3 (simulated)
    const s3Key = await uploadToStorage(content, filename);
    const fileSize = Buffer.byteLength(content, 'utf8');

    // Update job as completed
    await pool.query(
      `UPDATE treasury_export_jobs
       SET status='completed', output_s3_key=$2, checksum=$3, file_size_bytes=$4, completed_at=now(), updated_at=now()
       WHERE id=$1`,
      [jobId, s3Key, checksum, fileSize]
    );

    // Log export generation
    await logAuditEvent({
      eventType: 'export_generated',
      actor: 'system',
      entityId: jobId,
      payload: {
        job_id: jobId,
        format: job.format,
        period_start: job.period_start,
        period_end: job.period_end,
        checksum,
        file_size: fileSize
      }
    });

    console.log(`[Export] Job ${jobId} completed - ${filename} (${fileSize} bytes)`);

    return { s3Key, checksum, fileSize };
  } catch (e: any) {
    await client.query("ROLLBACK");

    // Mark as failed
    await pool.query(
      `UPDATE treasury_export_jobs SET status='failed', error_message=$2, updated_at=now() WHERE id=$1`,
      [jobId, e.message]
    );

    console.error(`[Export] Job ${jobId} failed:`, e.message);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Generate BCEAO CSV format
 */
function generateBCEAOCSV(logs: any[]): string {
  const lines = ['Date,Type,Actor,Entity,Amount,Currency,Description'];

  for (const log of logs) {
    const date = new Date(log.event_time).toISOString().split('T')[0];
    const type = log.event_type;
    const actor = log.actor;
    const entity = log.entity_id || '';
    const amount = log.payload?.amount || '';
    const currency = log.payload?.currency || '';
    const description = log.payload?.description || '';

    lines.push(`${date},"${type}","${actor}","${entity}","${amount}","${currency}","${description}"`);
  }

  return lines.join('\n');
}

/**
 * Generate BCE XML format
 */
function generateBCEXML(logs: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<TreasuryReport xmlns="urn:bce:treasury:v1">\n';
  xml += '  <ReportHeader>\n';
  xml += '    <Generator>Molam Treasury</Generator>\n';
  xml += `    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>\n`;
  xml += '  </ReportHeader>\n';
  xml += '  <Transactions>\n';

  for (const log of logs) {
    xml += '    <Transaction>\n';
    xml += `      <ID>${log.id}</ID>\n`;
    xml += `      <Type>${log.event_type}</Type>\n`;
    xml += `      <Timestamp>${log.event_time}</Timestamp>\n`;
    xml += `      <Actor>${log.actor}</Actor>\n`;
    xml += '    </Transaction>\n';
  }

  xml += '  </Transactions>\n';
  xml += '</TreasuryReport>';

  return xml;
}

/**
 * Generate FED JSON format
 */
function generateFEDJSON(logs: any[]): string {
  return JSON.stringify({
    report_type: 'FED_TREASURY_REPORT',
    generated_at: new Date().toISOString(),
    period_start: logs[0]?.event_time || null,
    period_end: logs[logs.length - 1]?.event_time || null,
    transactions: logs.map(log => ({
      id: log.id,
      type: log.event_type,
      timestamp: log.event_time,
      actor: log.actor,
      payload: log.payload
    }))
  }, null, 2);
}

/**
 * Generate SEC CSV format
 */
function generateSECCSV(logs: any[]): string {
  const lines = ['TransactionID,Timestamp,Type,Actor,Signature,Payload'];

  for (const log of logs) {
    const id = log.id;
    const timestamp = log.event_time;
    const type = log.event_type;
    const actor = log.actor;
    const signature = log.signature;
    const payload = JSON.stringify(log.payload).replace(/"/g, '""');

    lines.push(`"${id}","${timestamp}","${type}","${actor}","${signature}","${payload}"`);
  }

  return lines.join('\n');
}

/**
 * Upload to S3 (stub - integrate with AWS SDK)
 */
async function uploadToStorage(content: string, filename: string): Promise<string> {
  // TODO: Integrate with S3/MinIO/Azure Blob
  const s3Key = `exports/${new Date().getFullYear()}/${filename}`;
  console.log(`[Storage] Uploading ${filename} to ${s3Key}`);
  return s3Key;
}
