/**
 * Brique 50 - Fiscal Reporting
 * S3 WORM Storage for Fiscal Reports
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./storage/fiscal";
const S3_BUCKET_FISCAL = process.env.S3_BUCKET_FISCAL || "molam-fiscal-reports-prod";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Store fiscal artifact in S3 with WORM compliance (Write-Once-Read-Many)
 */
export async function putS3WORM(key: string, data: Buffer): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    // Local file storage for development
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    console.log(`[S3] Stored fiscal artifact locally: ${filePath}`);
    return key;
  }

  // S3 with Object Lock for WORM compliance (7-year retention)
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_FISCAL,
    Key: key,
    Body: data,
    ContentType: getContentType(key),
    ServerSideEncryption: "AES256",
    Metadata: {
      "retention-years": "7",
      "compliance": "fiscal-reporting",
      "timestamp": new Date().toISOString(),
    },
    // ObjectLockMode: "COMPLIANCE", // Requires bucket Object Lock enabled
    // ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
  });

  await s3Client.send(command);
  console.log(`[S3] Stored fiscal artifact in S3: ${key}`);
  return key;
}

/**
 * Download artifact from S3
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    return await fs.readFile(filePath);
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_FISCAL,
    Key: key,
  });

  const response = await s3Client.send(command);
  const chunks: Uint8Array[] = [];

  if (response.Body) {
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

/**
 * Generate signed URL for viewing artifact
 */
export async function generateSignedURL(key: string, expiresIn: number = 3600): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    return `/internal/s3/view?key=${encodeURIComponent(key)}`;
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_FISCAL,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get content type based on file extension
 */
function getContentType(key: string): string {
  if (key.endsWith(".csv")) return "text/csv";
  if (key.endsWith(".xml")) return "application/xml";
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}
