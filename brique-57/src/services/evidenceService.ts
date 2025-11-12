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

const BUCKET_NAME = process.env.EVIDENCE_BUCKET_NAME || 'molam-evidence-packages';

interface EvidencePackage {
  id: string;
  merchant_id: string;
  dispute_id: string | null;
  package_type: string;
  status: string;
  documents: any[];
  template_id: string | null;
  s3_key: string | null;
  file_hash: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatePackageInput {
  merchantId: string;
  disputeId?: string;
  packageType: 'chargeback_rebuttal' | 'fraud_claim' | 'pre_arbitration' | 'custom';
  templateId?: string;
  actorId?: string;
}

interface AddDocumentInput {
  packageId: string;
  merchantId: string;
  documentType: string;
  fileName: string;
  fileBuffer: Buffer;
  metadata?: any;
  actorId?: string;
}

/**
 * Create evidence package
 */
export async function createPackage(input: CreatePackageInput): Promise<EvidencePackage> {
  const { merchantId, disputeId, packageType, templateId, actorId } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<EvidencePackage>(
      `INSERT INTO evidence_packages (merchant_id, dispute_id, package_type, template_id, status, documents)
       VALUES ($1, $2, $3, $4, 'draft', '[]'::jsonb)
       RETURNING *`,
      [merchantId, disputeId || null, packageType, templateId || null]
    );

    const pkg = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evidence_package', pkg.id, 'create_package', actorId, JSON.stringify({ packageType, disputeId }), merchantId]
    );

    await client.query('COMMIT');

    return pkg;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Add document to evidence package
 */
export async function addDocument(input: AddDocumentInput): Promise<EvidencePackage> {
  const { packageId, merchantId, documentType, fileName, fileBuffer, metadata = {}, actorId } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify package ownership
    const { rows: pkgs } = await client.query<EvidencePackage>(
      'SELECT * FROM evidence_packages WHERE id = $1 AND merchant_id = $2',
      [packageId, merchantId]
    );

    if (pkgs.length === 0) {
      throw new Error('Evidence package not found');
    }

    if (pkgs[0].status !== 'draft') {
      throw new Error('Cannot modify submitted evidence package');
    }

    // Upload to S3
    const s3Key = `evidence/${merchantId}/${packageId}/${Date.now()}-${fileName}`;
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: metadata.contentType || 'application/octet-stream',
        Metadata: {
          merchant_id: merchantId,
          package_id: packageId,
          document_type: documentType,
          file_hash: fileHash,
        },
      })
    );

    // Add document to package
    const document = {
      id: crypto.randomUUID(),
      document_type: documentType,
      file_name: fileName,
      s3_key: s3Key,
      file_hash: fileHash,
      size: fileBuffer.length,
      metadata,
      uploaded_at: new Date().toISOString(),
    };

    const { rows } = await client.query<EvidencePackage>(
      `UPDATE evidence_packages
       SET documents = documents || $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(document), packageId]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evidence_package', packageId, 'add_document', actorId, JSON.stringify({ documentType, fileName }), merchantId]
    );

    await client.query('COMMIT');

    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Submit evidence package (finalize and lock)
 */
export async function submitPackage(
  packageId: string,
  merchantId: string,
  actorId?: string
): Promise<EvidencePackage> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify package
    const { rows: pkgs } = await client.query<EvidencePackage>(
      'SELECT * FROM evidence_packages WHERE id = $1 AND merchant_id = $2',
      [packageId, merchantId]
    );

    if (pkgs.length === 0) {
      throw new Error('Evidence package not found');
    }

    if (pkgs[0].status !== 'draft') {
      throw new Error('Package already submitted');
    }

    if (pkgs[0].documents.length === 0) {
      throw new Error('Cannot submit empty evidence package');
    }

    // Generate package hash
    const documentsJson = JSON.stringify(pkgs[0].documents);
    const packageHash = crypto.createHash('sha256').update(documentsJson).digest('hex');

    // Update status
    const { rows } = await client.query<EvidencePackage>(
      `UPDATE evidence_packages
       SET status = 'submitted', file_hash = $1, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [packageHash, packageId]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evidence_package', packageId, 'submit_package', actorId, JSON.stringify({ packageHash }), merchantId]
    );

    await client.query('COMMIT');

    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get evidence package
 */
export async function getPackage(packageId: string, merchantId: string): Promise<EvidencePackage | null> {
  const { rows } = await pool.query<EvidencePackage>(
    'SELECT * FROM evidence_packages WHERE id = $1 AND merchant_id = $2',
    [packageId, merchantId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * List evidence packages for merchant
 */
export async function listPackages(
  merchantId: string,
  disputeId?: string
): Promise<EvidencePackage[]> {
  let query = 'SELECT * FROM evidence_packages WHERE merchant_id = $1';
  const params: any[] = [merchantId];

  if (disputeId) {
    params.push(disputeId);
    query += ` AND dispute_id = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';

  const { rows } = await pool.query<EvidencePackage>(query, params);
  return rows;
}

/**
 * Generate presigned URL for document download
 */
export async function getDocumentDownloadUrl(
  packageId: string,
  documentId: string,
  merchantId: string,
  expiresIn: number = 3600
): Promise<string> {
  // Verify package and document
  const pkg = await getPackage(packageId, merchantId);
  if (!pkg) {
    throw new Error('Evidence package not found');
  }

  const document = pkg.documents.find((d: any) => d.id === documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  // Generate presigned URL
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: document.s3_key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

/**
 * Delete document from draft package
 */
export async function deleteDocument(
  packageId: string,
  documentId: string,
  merchantId: string,
  actorId?: string
): Promise<EvidencePackage> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify package
    const { rows: pkgs } = await client.query<EvidencePackage>(
      'SELECT * FROM evidence_packages WHERE id = $1 AND merchant_id = $2',
      [packageId, merchantId]
    );

    if (pkgs.length === 0) {
      throw new Error('Evidence package not found');
    }

    if (pkgs[0].status !== 'draft') {
      throw new Error('Cannot modify submitted evidence package');
    }

    // Remove document
    const { rows } = await client.query<EvidencePackage>(
      `UPDATE evidence_packages
       SET documents = (
         SELECT jsonb_agg(doc)
         FROM jsonb_array_elements(documents) doc
         WHERE doc->>'id' != $1
       ), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [documentId, packageId]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evidence_package', packageId, 'delete_document', actorId, JSON.stringify({ documentId }), merchantId]
    );

    await client.query('COMMIT');

    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
