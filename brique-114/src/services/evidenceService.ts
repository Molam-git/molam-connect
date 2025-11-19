/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Evidence Service: S3 upload, presigned URLs, storage
 */

import { pool } from "../db";
import AWS from "aws-sdk";
import crypto from "crypto";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

// S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1"
});

const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET || "molam-sira-evidence";

/**
 * Generate presigned URL for evidence upload
 */
export async function generatePresignedUrl(
  filename: string,
  contentType: string,
  uploadedBy: string
): Promise<{ url: string; key: string }> {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(16).toString("hex");
  const extension = filename.split(".").pop() || "bin";
  const key = `evidence/${uploadedBy}/${timestamp}-${hash}.${extension}`;

  const params = {
    Bucket: EVIDENCE_BUCKET,
    Key: key,
    ContentType: contentType,
    Expires: 3600 // 1 hour
  };

  const url = await s3.getSignedUrlPromise("putObject", params);

  logger.info({ key, contentType }, "Generated presigned URL");

  return { url, key };
}

/**
 * Store evidence metadata after upload
 */
export async function storeEvidence(data: {
  feedback_id: string;
  s3_key: string;
  evidence_type: "image" | "pdf" | "text" | "json";
  file_hash?: string;
  file_size?: number;
  content_type?: string;
  uploaded_by: string;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO sira_evidence
     (feedback_id, evidence_type, s3_key, s3_bucket, file_hash, file_size, content_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.feedback_id,
      data.evidence_type,
      data.s3_key,
      EVIDENCE_BUCKET,
      data.file_hash || null,
      data.file_size || null,
      data.content_type || null,
      data.uploaded_by
    ]
  );

  logger.info({ evidenceId: rows[0].id, feedbackId: data.feedback_id }, "Evidence stored");

  return rows[0];
}

/**
 * Compute file hash (SHA256)
 */
export async function computeFileHash(fileBuffer: Buffer): Promise<string> {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

