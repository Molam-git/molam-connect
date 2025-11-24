// worker/src/processDoc.ts
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { downloadFromS3 } from './s3-utils';
import { runOCR } from './ocr-processor';
import { runFaceMatch } from './face-match';
import { checkSanctions } from './sanctions-check';

// Configuration de la base de données
const pool = new Pool({
    user: process.env.DB_USER || 'molam_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'molam_kyc',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
});

// Fonctions crypto directement dans le fichier
function computeSHA256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

function validateChecksum(buffer: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = computeSHA256(buffer);
    return actualChecksum === expectedChecksum;
}

async function processDocument(docId: string) {
    let client;
    try {
        client = await pool.connect();

        const docResult = await client.query(
            `SELECT * FROM wallet_documents WHERE id = $1 AND status = 'processing'`,
            [docId]
        );

        if (docResult.rows.length === 0) {
            console.log(`Document ${docId} not found or not in processing status`);
            return;
        }

        const doc = docResult.rows[0];
        console.log(`Processing document ${docId} for user ${doc.user_id}`);

        const fileBuffer = await downloadFromS3(doc.s3_key);

        // Valider le checksum
        if (doc.checksum) {
            const isValid = validateChecksum(fileBuffer, doc.checksum);
            if (!isValid) {
                console.error(`Checksum mismatch for document ${docId}`);
                await client.query(
                    `UPDATE wallet_documents SET status = 'error', updated_at = NOW() WHERE id = $1`,
                    [docId]
                );
                return;
            }
            console.log(`Checksum validated for document ${docId}`);
        }

        // Exécuter les vérifications
        const ocr = await runOCR(fileBuffer);
        // Ici, doc.metadata.selfie_s3 est une chaîne (la clé S3) donc on peut l'utiliser directement
        const faceMatch = doc.metadata.selfie_s3 ? await runFaceMatch(doc.metadata.selfie_s3, doc.s3_key) : null;
        const sanctions = await checkSanctions(ocr.names || []);

        const score = computeScore(ocr, faceMatch, sanctions);

        // Enregistrer les résultats
        await client.query(
            `INSERT INTO wallet_verification_tasks (document_id, task_type, status, score, result) VALUES ($1, $2, $3, $4, $5)`,
            [docId, 'auto_verification', 'passed', score, JSON.stringify({ ocr, faceMatch, sanctions })]
        );

        if (score > 85 && !sanctions.flag) {
            await client.query(
                `UPDATE wallet_documents SET status = 'auto_verified', updated_at = NOW() WHERE id = $1`,
                [docId]
            );
            await upsertUserVerification(client, doc.user_id, docId, 'verified');
            console.log(`Document ${docId} auto-verified with score ${score}`);
        } else {
            await client.query(
                `UPDATE wallet_documents SET status = 'needs_manual', updated_at = NOW() WHERE id = $1`,
                [docId]
            );
            await client.query(
                `INSERT INTO wallet_verification_tasks (document_id, task_type, status, assigned_to) VALUES ($1, 'manual_review', 'queued', NULL)`,
                [docId]
            );
            console.log(`Document ${docId} needs manual review (score: ${score})`);
        }

    } catch (error) {
        console.error(`Error processing document ${docId}:`, error);

        // Marquer le document comme erreur
        if (client) {
            await client.query(
                `UPDATE wallet_documents SET status = 'error', updated_at = NOW() WHERE id = $1`,
                [docId]
            );
        }
    } finally {
        if (client) {
            client.release();
        }
    }
}

function computeScore(ocr: any, faceMatch: any, sanctions: any): number {
    let score = 0;
    if (ocr.confidence > 0.8) score += 40;
    if (faceMatch?.similarity > 0.9) score += 40;
    if (!sanctions.flag) score += 20;
    return score;
}

async function upsertUserVerification(client: any, userId: string, docId: string, status: string) {
    await client.query(
        `INSERT INTO wallet_verifications (user_id, primary_document_id, status, last_checked_at, updated_at) 
     VALUES ($1, $2, $3, NOW(), NOW()) 
     ON CONFLICT (user_id) 
     DO UPDATE SET 
       primary_document_id = $2, 
       status = $3, 
       last_checked_at = NOW(), 
       updated_at = NOW()`,
        [userId, docId, status]
    );
}

export { processDocument };