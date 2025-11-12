/**
 * Brique 47 - Disputes & Chargebacks
 * S3 WORM Storage for Evidence
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./storage/evidence";
const S3_BUCKET_EVIDENCE = process.env.S3_BUCKET_EVIDENCE || "molam-disputes-evidence-prod";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Calculate SHA256 hash of a buffer
 */
export function calculateHash(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Store evidence in S3 (Write-Once-Read-Many)
 */
export async function putEvidence(key: string, data: Buffer): Promise<string> {
  const hash = calculateHash(data);

  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    console.log(`Stored evidence locally: ${filePath}`);
    return hash;
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_EVIDENCE,
    Key: key,
    Body: data,
    ContentType: "application/octet-stream",
    ServerSideEncryption: "AES256",
    Metadata: {
      "sha256-hash": hash,
    },
    // ObjectLockMode: "COMPLIANCE", // Requires S3 Object Lock enabled on bucket
    // ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
  });

  await s3Client.send(command);
  console.log(`Stored evidence in S3: ${key}`);
  return hash;
}

/**
 * Generate signed URL for evidence download (5 minute expiry)
 */
export async function getEvidenceURL(key: string, expiresIn = 300): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    return `/storage/evidence/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_EVIDENCE,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}
