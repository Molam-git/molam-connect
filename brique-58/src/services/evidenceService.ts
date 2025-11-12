import { pool } from '../utils/db';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.EVIDENCE_BUCKET_NAME || 'molam-dispute-evidence';

export interface UploadEvidenceInput {
  disputeId: string;
  uploadedBy: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  evidenceType: string;
  metadata?: any;
}

export interface Evidence {
  id: string;
  dispute_id: string;
  uploaded_by: string;
  file_s3_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  file_hash: string;
  evidence_type: string;
  metadata: any;
  created_at: string;
}

/**
 * Upload evidence document to S3 and create database record
 */
export async function uploadEvidence(input: UploadEvidenceInput): Promise<Evidence> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify dispute exists
    const { rows: disputes } = await client.query('SELECT id, merchant_id FROM disputes WHERE id = $1', [
      input.disputeId,
    ]);

    if (disputes.length === 0) {
      throw new Error('Dispute not found');
    }

    const merchantId = disputes[0].merchant_id;

    // Generate S3 key and file hash
    const timestamp = Date.now();
    const s3Key = `evidence/${merchantId}/${input.disputeId}/${timestamp}-${input.fileName}`;
    const fileHash = crypto.createHash('sha256').update(input.fileBuffer).digest('hex');

    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: input.fileBuffer,
        ContentType: input.mimeType,
        Metadata: {
          dispute_id: input.disputeId,
          merchant_id: merchantId,
          uploaded_by: input.uploadedBy,
          file_hash: fileHash,
          evidence_type: input.evidenceType,
        },
      })
    );

    // Create database record
    const { rows } = await client.query<Evidence>(
      `INSERT INTO dispute_evidence (
        dispute_id, uploaded_by, file_s3_key, file_name, file_size,
        mime_type, file_hash, evidence_type, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.disputeId,
        input.uploadedBy,
        s3Key,
        input.fileName,
        input.fileBuffer.length,
        input.mimeType,
        fileHash,
        input.evidenceType,
        JSON.stringify(input.metadata || {}),
      ]
    );

    const evidence = rows[0];

    // Create event
    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.disputeId,
        input.uploadedBy,
        'merchant',
        'evidence_uploaded',
        JSON.stringify({ evidence_id: evidence.id, file_name: input.fileName, evidence_type: input.evidenceType }),
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'dispute_evidence',
        evidence.id,
        'uploaded',
        input.uploadedBy,
        JSON.stringify({ dispute_id: input.disputeId, file_name: input.fileName }),
        merchantId,
      ]
    );

    await client.query('COMMIT');

    return evidence;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List evidence for a dispute
 */
export async function listEvidence(disputeId: string): Promise<Evidence[]> {
  const { rows } = await pool.query<Evidence>(
    `SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC`,
    [disputeId]
  );
  return rows;
}

/**
 * Get evidence by ID
 */
export async function getEvidence(evidenceId: string): Promise<Evidence | null> {
  const { rows } = await pool.query<Evidence>('SELECT * FROM dispute_evidence WHERE id = $1', [evidenceId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Generate presigned download URL for evidence
 */
export async function getEvidenceDownloadUrl(evidenceId: string, expiresIn: number = 3600): Promise<string> {
  const evidence = await getEvidence(evidenceId);
  if (!evidence) {
    throw new Error('Evidence not found');
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: evidence.file_s3_key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

/**
 * Delete evidence (ops only, before submission)
 */
export async function deleteEvidence(evidenceId: string, actorId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get evidence details
    const { rows } = await client.query<Evidence>('SELECT * FROM dispute_evidence WHERE id = $1', [evidenceId]);

    if (rows.length === 0) {
      throw new Error('Evidence not found');
    }

    const evidence = rows[0];

    // Check dispute status (can only delete if not submitted)
    const { rows: disputes } = await client.query('SELECT status, merchant_id FROM disputes WHERE id = $1', [
      evidence.dispute_id,
    ]);

    if (disputes.length === 0 || ['submitted', 'network_review', 'won', 'lost'].includes(disputes[0].status)) {
      throw new Error('Cannot delete evidence after submission');
    }

    // Delete from database (S3 object remains for audit trail)
    await client.query('DELETE FROM dispute_evidence WHERE id = $1', [evidenceId]);

    // Create event
    await client.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        evidence.dispute_id,
        actorId,
        'ops',
        'evidence_deleted',
        JSON.stringify({ evidence_id: evidenceId, file_name: evidence.file_name }),
      ]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'dispute_evidence',
        evidenceId,
        'deleted',
        actorId,
        JSON.stringify({ dispute_id: evidence.dispute_id }),
        disputes[0].merchant_id,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Assemble evidence package for network submission
 */
export async function assembleEvidencePackage(disputeId: string): Promise<{
  dispute: any;
  evidence: Evidence[];
  package_url?: string;
}> {
  // Get dispute
  const { rows: disputes } = await pool.query('SELECT * FROM disputes WHERE id = $1', [disputeId]);

  if (disputes.length === 0) {
    throw new Error('Dispute not found');
  }

  const dispute = disputes[0];

  // Get all evidence
  const evidence = await listEvidence(disputeId);

  // TODO: Generate ZIP package with all evidence + cover letter
  // For now, return list of evidence with download URLs

  return {
    dispute,
    evidence,
  };
}
