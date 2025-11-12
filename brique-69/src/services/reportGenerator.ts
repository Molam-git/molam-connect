/**
 * Report Generation Service
 * Generates reports in CSV, Excel, and PDF formats
 */

import { Pool } from 'pg';
import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

export interface ReportQuery {
  from: string;
  to: string;
  granularity?: 'hour' | 'day';
  metrics?: string[];
  dimensions?: string[];
  filters?: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  merchantId?: string;
}

export interface GeneratedReport {
  filePath: string;
  fileName: string;
  format: string;
  rowCount: number;
  fileSizeBytes: number;
}

const TEMP_DIR = process.env.REPORT_TEMP_DIR || '/tmp/reports';

export class ReportGenerator {
  constructor(private pool: Pool) {}

  /**
   * Generate report in specified format
   */
  async generateReport(
    query: ReportQuery,
    format: 'csv' | 'xlsx' | 'pdf',
    reportName: string = 'Analytics Report'
  ): Promise<GeneratedReport> {
    // Ensure temp directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Fetch data
    const data = await this.fetchReportData(query);

    // Generate file based on format
    let result: GeneratedReport;
    switch (format) {
      case 'csv':
        result = await this.generateCSV(data, reportName);
        break;
      case 'xlsx':
        result = await this.generateExcel(data, reportName, query);
        break;
      case 'pdf':
        result = await this.generatePDF(data, reportName, query);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return result;
  }

  /**
   * Fetch report data from database
   */
  private async fetchReportData(query: ReportQuery): Promise<any[]> {
    const {
      from,
      to,
      granularity = 'day',
      metrics = ['gross_volume_usd', 'net_revenue_usd', 'tx_count'],
      dimensions = ['day'],
      filters = {},
      sortBy = 'day',
      sortOrder = 'desc',
      limit = 10000,
      merchantId,
    } = query;

    // Build SQL query dynamically
    const selectCols = [...dimensions, ...metrics.map(m => `SUM(${this.mapMetricToColumn(m)}) as ${m}`)];
    const table = granularity === 'hour' ? 'txn_hourly_agg' : 'mv_txn_daily_agg';
    const timeCol = granularity === 'hour' ? 'hour' : 'day';

    let whereClauses = [
      `${timeCol} BETWEEN $1::timestamptz AND $2::timestamptz`,
    ];
    const params: any[] = [from, to];
    let paramIndex = 3;

    if (merchantId) {
      whereClauses.push(`merchant_id = $${paramIndex}`);
      params.push(merchantId);
      paramIndex++;
    }

    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        whereClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    const sql = `
      SELECT ${selectCols.join(', ')}
      FROM ${table}
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY ${dimensions.join(', ')}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limit}
    `;

    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Map metric name to database column
   */
  private mapMetricToColumn(metric: string): string {
    const mapping: Record<string, string> = {
      gross_volume_usd: 'gross_volume_usd',
      net_revenue_usd: 'net_revenue_usd',
      fees_molam_usd: 'fees_molam_usd',
      fees_partner_usd: 'fees_partner_usd',
      refunds_usd: 'refunds_usd',
      chargebacks_usd: 'chargebacks_usd',
      tx_count: 'tx_count',
      success_count: 'success_count',
      failed_count: 'failed_count',
    };
    return mapping[metric] || metric;
  }

  /**
   * Generate CSV report
   */
  private async generateCSV(data: any[], reportName: string): Promise<GeneratedReport> {
    const fileName = `${this.sanitizeFileName(reportName)}_${Date.now()}.csv`;
    const filePath = join(TEMP_DIR, fileName);

    if (data.length === 0) {
      await fs.writeFile(filePath, 'No data available\n');
      const stats = await fs.stat(filePath);
      return { filePath, fileName, format: 'csv', rowCount: 0, fileSizeBytes: stats.size };
    }

    const headers = Object.keys(data[0]).map(key => ({ id: key, title: key }));

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers,
    });

    await csvWriter.writeRecords(data);

    const stats = await fs.stat(filePath);

    return {
      filePath,
      fileName,
      format: 'csv',
      rowCount: data.length,
      fileSizeBytes: stats.size,
    };
  }

  /**
   * Generate Excel report with formatting
   */
  private async generateExcel(
    data: any[],
    reportName: string,
    query: ReportQuery
  ): Promise<GeneratedReport> {
    const fileName = `${this.sanitizeFileName(reportName)}_${Date.now()}.xlsx`;
    const filePath = join(TEMP_DIR, fileName);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Molam Analytics';
    workbook.created = new Date();

    // Main data sheet
    const worksheet = workbook.addWorksheet('Analytics Data');

    // Add header
    worksheet.addRow([reportName]);
    worksheet.addRow([`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`]);
    worksheet.addRow([`Period: ${query.from} to ${query.to}`]);
    worksheet.addRow([]); // Empty row

    if (data.length === 0) {
      worksheet.addRow(['No data available']);
    } else {
      // Add column headers
      const headers = Object.keys(data[0]);
      const headerRow = worksheet.addRow(headers);

      // Style header row
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0284C7' },
      };
      headerRow.alignment = { horizontal: 'center' };

      // Add data rows
      data.forEach(row => {
        const values = headers.map(h => row[h]);
        worksheet.addRow(values);
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, cell => {
          const length = cell.value ? cell.value.toString().length : 10;
          if (length > maxLength) maxLength = length;
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Add summary sheet if metrics exist
      if (query.metrics && query.metrics.length > 0) {
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.addRow(['Metric', 'Total']);

        query.metrics.forEach(metric => {
          const total = data.reduce((sum, row) => sum + (Number(row[metric]) || 0), 0);
          summarySheet.addRow([metric, total]);
        });
      }
    }

    await workbook.xlsx.writeFile(filePath);

    const stats = await fs.stat(filePath);

    return {
      filePath,
      fileName,
      format: 'xlsx',
      rowCount: data.length,
      fileSizeBytes: stats.size,
    };
  }

  /**
   * Generate PDF report with charts
   */
  private async generatePDF(
    data: any[],
    reportName: string,
    query: ReportQuery
  ): Promise<GeneratedReport> {
    const fileName = `${this.sanitizeFileName(reportName)}_${Date.now()}.pdf`;
    const filePath = join(TEMP_DIR, fileName);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = createWriteStream(filePath);

      doc.pipe(writeStream);

      // Header
      doc.fontSize(20).text(reportName, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, { align: 'center' });
      doc.text(`Period: ${query.from} to ${query.to}`, { align: 'center' });
      doc.moveDown(2);

      if (data.length === 0) {
        doc.fontSize(12).text('No data available for the selected period.');
      } else {
        // Summary section
        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown();

        if (query.metrics) {
          query.metrics.forEach(metric => {
            const total = data.reduce((sum, row) => sum + (Number(row[metric]) || 0), 0);
            doc.fontSize(12).text(`${metric}: ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
          });
        }

        doc.moveDown(2);

        // Data table (first 50 rows to avoid huge PDFs)
        doc.fontSize(14).text('Data', { underline: true });
        doc.moveDown();

        const headers = Object.keys(data[0]);
        const displayData = data.slice(0, 50);

        // Simple table rendering
        doc.fontSize(9);
        const colWidth = 80;
        let yPosition = doc.y;

        // Headers
        headers.forEach((header, i) => {
          doc.text(header, 50 + i * colWidth, yPosition, { width: colWidth - 5 });
        });

        yPosition += 20;

        // Data rows
        displayData.forEach((row, rowIndex) => {
          headers.forEach((header, colIndex) => {
            const value = row[header]?.toString() || '';
            doc.text(value.substring(0, 15), 50 + colIndex * colWidth, yPosition, { width: colWidth - 5 });
          });
          yPosition += 15;

          // Add new page if needed
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
        });

        if (data.length > 50) {
          doc.moveDown(2);
          doc.fontSize(10).text(`... and ${data.length - 50} more rows (see CSV/Excel export for full data)`, { align: 'center', color: 'gray' });
        }
      }

      // Footer
      doc.fontSize(8).text('Molam Analytics • Confidential', 50, doc.page.height - 50, { align: 'center', color: 'gray' });

      doc.end();

      writeStream.on('finish', async () => {
        const stats = await fs.stat(filePath);
        resolve({
          filePath,
          fileName,
          format: 'pdf',
          rowCount: data.length,
          fileSizeBytes: stats.size,
        });
      });

      writeStream.on('error', reject);
    });
  }

  /**
   * Sanitize file name
   */
  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);
  }
}

// Singleton instance
let reportGeneratorInstance: ReportGenerator | null = null;

export function getReportGenerator(pool: Pool): ReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = new ReportGenerator(pool);
  }
  return reportGeneratorInstance;
}
