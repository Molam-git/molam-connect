// S3 helpers for fetching statement files
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined,
});

const STATEMENTS_BUCKET = process.env.STATEMENTS_BUCKET || 'molam-bank-statements';

export async function fetchS3File(key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: STATEMENTS_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty S3 response body');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error: any) {
    console.error('S3 fetch error:', error);
    throw new Error(`Failed to fetch S3 file ${key}: ${error.message}`);
  }
}

export async function uploadS3File(key: string, body: Buffer | string): Promise<string> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const command = new PutObjectCommand({
    Bucket: STATEMENTS_BUCKET,
    Key: key,
    Body: body,
    ServerSideEncryption: 'AES256',
  });
  await s3Client.send(command);
  return key;
}
