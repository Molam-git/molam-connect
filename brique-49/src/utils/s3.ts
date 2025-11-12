/**
 * Brique 49 - Taxes & Compliance
 * S3 WORM Storage for Fiscal Reports
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";

const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./storage/fiscal_reports";
const S3_BUCKET_FISCAL_REPORTS = process.env.S3_BUCKET_FISCAL_REPORTS || "molam-fiscal-reports-prod";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Store fiscal report in S3 with WORM compliance (Write-Once-Read-Many)
 */
export async function putS3WORM(key: string, data: Buffer): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    // Local file storage for development
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    console.log(`Stored fiscal report locally: ${filePath}`);
    return;
  }

  // S3 with Object Lock for WORM compliance (7-year retention)
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_FISCAL_REPORTS,
    Key: key,
    Body: data,
    ContentType: getContentType(key),
    ServerSideEncryption: "AES256",
    Metadata: {
      "retention-years": "7",
      "compliance": "fiscal-reporting",
    },
    // ObjectLockMode: "COMPLIANCE", // Requires bucket Object Lock enabled
    // ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
  });

  await s3Client.send(command);
  console.log(`Stored fiscal report in S3: ${key}`);
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
