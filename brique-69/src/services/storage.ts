/**
 * S3/MinIO Storage Service
 * Handles secure file uploads with presigned URLs
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';

export interface UploadResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  private urlExpirationSeconds: number;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'molam-analytics-reports';
    this.urlExpirationSeconds = parseInt(process.env.S3_URL_EXPIRATION || '86400', 10); // 24 hours

    // Configure S3 client (works with MinIO too)
    this.s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT, // For MinIO, set to MinIO endpoint
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: !!process.env.S3_ENDPOINT, // Required for MinIO
    });
  }

  /**
   * Upload file to S3/MinIO and return presigned URL
   */
  async uploadFile(
    filePath: string,
    fileName: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const key = this.generateKey(fileName);

    // Read file
    const fileContent = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    // Determine content type
    const contentType = this.getContentType(fileName);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      },
      ServerSideEncryption: 'AES256', // Encrypt at rest
    });

    await this.s3Client.send(command);

    // Generate presigned URL
    const url = await this.getPresignedDownloadUrl(key);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + this.urlExpirationSeconds * 1000);

    // Clean up local file
    await fs.unlink(filePath).catch(err => console.warn('Failed to delete temp file:', err));

    return { url, key, expiresAt };
  }

  /**
   * Get presigned download URL
   */
  async getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: expiresIn || this.urlExpirationSeconds,
    });

    return url;
  }

  /**
   * Generate unique key for file
   */
  private generateKey(fileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `reports/${year}/${month}/${day}/${timestamp}_${random}_${fileName}`;
  }

  /**
   * Get content type from file extension
   */
  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      json: 'application/json',
    };
    return types[ext || ''] || 'application/octet-stream';
  }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}
