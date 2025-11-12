/**
 * WORM Storage - AWS S3 with Object Lock
 * For immutable evidence storage
 */
import AWS from "aws-sdk";
import crypto from "crypto";

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const WORM_BUCKET = process.env.WORM_BUCKET || "molam-disputes-evidence";

/**
 * Store file in WORM S3 bucket (immutable)
 */
export async function storeFileWORM(buf: Buffer, key: string): Promise<string> {
  try {
    await s3
      .putObject({
        Bucket: WORM_BUCKET,
        Key: key,
        Body: buf,
        Metadata: {
          uploaded_by: "molam-disputes",
          uploaded_at: new Date().toISOString(),
        },
        // Enable Object Lock if bucket is configured
        // ObjectLockMode: 'COMPLIANCE',
        // ObjectLockRetainUntilDate: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000), // 7 years
      })
      .promise();

    return `s3://${WORM_BUCKET}/${key}`;
  } catch (error) {
    console.error("Failed to store file in WORM S3:", error);
    throw new Error("storage_failed");
  }
}

/**
 * Retrieve file from WORM storage
 */
export async function retrieveFileWORM(key: string): Promise<Buffer> {
  try {
    const s3Key = key.replace(`s3://${WORM_BUCKET}/`, "");
    const result = await s3
      .getObject({
        Bucket: WORM_BUCKET,
        Key: s3Key,
      })
      .promise();

    return result.Body as Buffer;
  } catch (error) {
    console.error("Failed to retrieve file from WORM S3:", error);
    throw new Error("retrieval_failed");
  }
}

/**
 * Compute SHA-256 hash of buffer
 */
export function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Verify file integrity by comparing hash
 */
export async function verifyFileIntegrity(s3Key: string, expectedHash: string): Promise<boolean> {
  try {
    const buf = await retrieveFileWORM(s3Key);
    const actualHash = hashBuffer(buf);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}
