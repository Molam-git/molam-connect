import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { db } from '../db/knex.js';
import { sha256File, signDigest } from './signature.js';

type ExportParams = {
    agentId: string;
    from: string; to: string;
    currency?: string;
    reportType: 'KPIS' | 'EVENTS' | 'PAYOUTS' | 'BALANCES';
    createdBy: string;
};

export async function exportCSV(rows: any[], filename: string): Promise<string> {
    const out = path.join(config.exports.dir, filename);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const header = Object.keys(rows[0] ?? { info: 'no_data' });
    const lines = [header.join(',')].concat(
        rows.map(r => header.map(h => JSON.stringify(r[h] ?? '')).join(','))
    );
    fs.writeFileSync(out, lines.join('\n'), 'utf8');
    return out;
}

export async function exportPDF(title: string, rows: any[], filename: string): Promise<string> {
    const out = path.join(config.exports.dir, filename);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(fs.createWriteStream(out));
    doc.fontSize(18).text(title, { underline: true });
    doc.moveDown();

    if (!rows.length) {
        doc.fontSize(12).text('Aucune donnée pour la période.');
    } else {
        const cols = Object.keys(rows[0]);
        doc.fontSize(10).text(cols.join(' | '));
        doc.moveDown(0.5);
        rows.forEach(r => {
            const line = cols.map(c => String(r[c] ?? '')).join(' | ');
            doc.text(line);
        });
    }

    doc.moveDown();
    doc.fontSize(8).text(`Généré: ${new Date().toISOString()}`);
    doc.end();
    return out;
}

export async function persistExport(scopeType: 'AGENT' | 'INTERNAL', scopeRef: string | null, reportType: ExportParams['reportType'], params: any, filePath: string, createdBy: string) {
    const file_sha256 = await sha256File(filePath);
    const sig = await signDigest(file_sha256.replace(/^0x/, ''));
    const export_id = uuid();
    await db('report_exports').insert({
        export_id, scope_type: scopeType, scope_ref: scopeRef,
        report_type: reportType, params,
        file_path: filePath, file_sha256,
        signature_algo: sig.algo, signature_value: sig.signature,
        created_by: createdBy
    });
    return { export_id, file_sha256, signature: sig };
}