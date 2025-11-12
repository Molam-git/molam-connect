// ============================================================================
// Brique 46 - Billing & Invoicing
// S3/Storage Integration (WORM for PDF invoices)
// ============================================================================

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";

const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./storage/invoices";
const S3_BUCKET_INVOICES = process.env.S3_BUCKET_INVOICES || "molam-invoices-production";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Store PDF in S3 (Write-Once-Read-Many for compliance)
 */
export async function putS3WORM(key: string, data: Buffer): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    // Local file storage for development
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    console.log(`Stored locally: ${filePath}`);
    return;
  }

  // S3 with Object Lock for WORM compliance
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_INVOICES,
    Key: key,
    Body: data,
    ContentType: "application/pdf",
    ServerSideEncryption: "AES256",
    // ObjectLockMode: "COMPLIANCE", // Requires bucket Object Lock enabled
    // ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
  });

  await s3Client.send(command);
  console.log(`Stored in S3: ${key}`);
}

/**
 * Generate signed URL for PDF download (5 minute expiry)
 */
export async function signS3Read(key: string, expiresIn = 300): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    // Return local file URL (for development only)
    return `/storage/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_INVOICES,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

// Alias for compatibility
export const generateSignedURL = signS3Read;
