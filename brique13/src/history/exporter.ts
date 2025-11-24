import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { Transaction } from '../shared/types';

function lineHash(row: Transaction): string {
    const s = `${row.id}|${row.created_at}|${row.tx_type}|${row.amount}|${row.currency}`;
    return crypto.createHash('sha256').update(s).digest('hex');
}

export async function exportCsv(rows: Transaction[]): Promise<string> {
    const withHash = rows.map(r => ({
        ...r,
        integrity_hash: lineHash(r)
    }));

    const csv = stringify(withHash, {
        header: true,
        columns: [
            'id', 'created_at', 'tx_type', 'status', 'amount', 'currency',
            'country_code', 'channel', 'reference', 'molam_fee', 'partner_fee',
            'refunded_amount', 'risk_score', 'integrity_hash'
        ]
    });

    const exportDir = process.env.EXPORT_DIR || '/tmp/exports';
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }

    const filePath = path.join(exportDir, `molam-history-${Date.now()}.csv`);
    fs.writeFileSync(filePath, csv);

    return filePath;
}

export async function exportPdf(rows: Transaction[], meta: { title: string }): Promise<string> {
    const exportDir = process.env.EXPORT_DIR || '/tmp/exports';
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }

    const filePath = path.join(exportDir, `molam-history-${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    doc.info.Title = meta.title;
    doc.info.Author = 'Molam Pay';
    doc.info.CreationDate = new Date();

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // En-tête
    doc.fontSize(16).text(meta.title, { align: 'left' });
    doc.fontSize(10).text(`Generated on: ${new Date().toISOString()}`);
    doc.moveDown();

    // Tableau des transactions
    const tableTop = doc.y;
    const colWidths = [80, 50, 40, 50, 40, 60];

    // En-têtes du tableau
    doc.fontSize(8);
    doc.text('Date', 40, tableTop);
    doc.text('Type', 40 + colWidths[0], tableTop);
    doc.text('Amount', 40 + colWidths[0] + colWidths[1], tableTop);
    doc.text('Currency', 40 + colWidths[0] + colWidths[1] + colWidths[2], tableTop);
    doc.text('Status', 40 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);
    doc.text('Reference', 40 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop);

    doc.moveTo(40, tableTop + 15)
        .lineTo(40 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
        .stroke();

    let y = tableTop + 25;

    // Lignes de données
    rows.slice(0, 100).forEach((r, i) => {
        if (y > 700) {
            doc.addPage();
            y = 40;
        }

        const h = lineHash(r);
        doc.fontSize(7);
        doc.text(new Date(r.created_at).toLocaleDateString(), 40, y, { width: colWidths[0] });
        doc.text(r.tx_type.toUpperCase(), 40 + colWidths[0], y, { width: colWidths[1] });
        doc.text(r.amount, 40 + colWidths[0] + colWidths[1], y, { width: colWidths[2] });
        doc.text(r.currency, 40 + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] });
        doc.text(r.status, 40 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { width: colWidths[4] });
        doc.text(r.reference || '-', 40 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, {
            width: colWidths[5]
        });

        // Hash d'intégrité en petit
        doc.fontSize(5).text(`#${h.substring(0, 12)}`, 40, y + 10);

        y += 20;
    });

    // Signature du document
    const globalHash = crypto.createHash('sha256')
        .update(JSON.stringify(rows.map(lineHash)))
        .digest('hex');

    doc.addPage();
    doc.fontSize(10).text('Document Integrity', { underline: true });
    doc.moveDown();
    doc.fontSize(8).text(`Global Hash: ${globalHash}`);
    doc.text(`Total Transactions: ${rows.length}`);
    doc.text(`Generated: ${new Date().toISOString()}`);

    doc.end();

    return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
}