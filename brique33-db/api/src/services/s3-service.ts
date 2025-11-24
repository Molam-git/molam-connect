import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

export const createPresignedPut = async (key: string, options: { contentType?: string } = {}) => {
    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Conditions: [
            ['content-length-range', 0, 10485760], // 10MB max
            ['starts-with', '$Content-Type', 'image/'],
            ['starts-with', '$Content-Type', 'application/'],
        ],
        Expires: 900, // 15 minutes
        Fields: {
            'Content-Type': options.contentType || 'application/octet-stream',
        },
    });

    return { url, fields };
};