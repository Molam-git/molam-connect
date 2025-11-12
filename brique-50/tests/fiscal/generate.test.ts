/**
 * Brique 50 - Fiscal Reporting
 * Test: Report Generation
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { pool } from "../../src/utils/db.js";
import { generateFiscalReport } from "../../src/services/fiscalReportService.js";

describe("Fiscal Report Generation", () => {
  beforeAll(async () => {
    // Ensure database is connected
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    // Cleanup
    await pool.end();
  });

  test("should generate VAT return report", async () => {
    const params = {
      legalEntity: "MOLAM_FR_SARL",
      reportType: "vat_return",
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      createdBy: "test-user-123",
    };

    const report = await generateFiscalReport(params);

    expect(report).toBeDefined();
    expect(report.id).toBeDefined();
    expect(report.legal_entity).toBe(params.legalEntity);
    expect(report.report_type).toBe(params.reportType);
    expect(report.status).toMatch(/generated|ready/);
    expect(report.artifact_s3_key).toBeDefined();
  });

  test("should calculate SIRA reject score", async () => {
    const params = {
      legalEntity: "MOLAM_SN_SARL",
      reportType: "withholding",
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      createdBy: "test-user-456",
    };

    const report = await generateFiscalReport(params);

    expect(report.sira_reject_score).toBeDefined();
    expect(report.sira_reject_score).toBeGreaterThanOrEqual(0);
    expect(report.sira_reject_score).toBeLessThanOrEqual(100);
  });
});
