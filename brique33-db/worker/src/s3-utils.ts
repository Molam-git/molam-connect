// worker/src/s3-utils.ts
import { S3 } from 'aws-sdk';

const s3 = new S3({
    region: process.env.AWS_REGION || 'us-west-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

export async function downloadFromS3(s3Key: string): Promise<Buffer> {
    try {
        const params = {
            Bucket: process.env.S3_BUCKET!,
            Key: s3Key,
        };

        const response = await s3.getObject(params).promise();

        if (!response.Body) {
            throw new Error('Empty response body from S3');
        }

        // Gérer les différents types de Body
        if (response.Body instanceof Buffer) {
            return response.Body;
        } else if (typeof response.Body === 'string') {
            return Buffer.from(response.Body);
        } else {
            // Pour les streams, convertir en Buffer
            const stream = response.Body as any;
            return new Promise((resolve, reject) => {
                const chunks: Buffer[] = [];
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                stream.on('error', reject);
                stream.on('end', () => resolve(Buffer.concat(chunks)));
            });
        }
    } catch (error) {
        console.error(`Failed to download from S3: ${s3Key}`, error);
        throw error;
    }
}

// Fonction utilitaire pour vérifier si un fichier existe dans S3
export async function checkS3FileExists(s3Key: string): Promise<boolean> {
    try {
        await s3.headObject({
            Bucket: process.env.S3_BUCKET!,
            Key: s3Key,
        }).promise();
        return true;
    } catch (error) {
        if ((error as any).code === 'NotFound') {
            return false;
        }
        throw error;
    }
}

// Fonction pour lister les fichiers dans un préfixe S3
export async function listS3Files(prefix: string): Promise<string[]> {
    try {
        const response = await s3.listObjectsV2({
            Bucket: process.env.S3_BUCKET!,
            Prefix: prefix,
        }).promise();

        return response.Contents?.map(item => item.Key!).filter(Boolean) || [];
    } catch (error) {
        console.error(`Failed to list S3 files with prefix: ${prefix}`, error);
        return [];
    }
}