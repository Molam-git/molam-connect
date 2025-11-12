/**
 * Brique 49 - Tax Routes
 * API endpoints for tax computation and management
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { requireRole } from "../utils/authz.js";
import { computeTaxForCharges } from "../services/taxCompute.js";
import { generateVatReturn, generateWithholdingSummary, generateTaxStatement } from "../services/reportGen.js";
import { publishEvent } from "../utils/events.js";
import { auditLog } from "../utils/audit.js";

export const taxRouter = Router();

/**
 * POST /api/tax/compute
 * Compute taxes for billing charges (batch)
 */
taxRouter.post("/compute", requireRole(["finance_ops", "tax_ops"]), async (req: Request, res: Response) => {
  try {
    const { chargeIds } = req.body;

    if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
      return res.status(400).json({ error: "no_charge_ids" });
    }

    const result = await computeTaxForCharges(chargeIds, req.user?.id || "system");

    // Publish event for downstream systems
    await publishEvent("internal", null, "tax.compute.completed", { processed: result.processed, errors: result.errors });

    res.json({ ok: true, processed: result.processed, errors: result.errors });
  } catch (err: any) {
    console.error("Tax compute error:", err);
    res.status(500).json({ error: "server_error", detail: err.message });
  }
});

/**
 * GET /api/tax/lines
 * Query tax lines
 */
taxRouter.get("/lines", requireRole(["finance_ops", "auditor", "tax_ops"]), async (req: Request, res: Response) => {
  try {
    const { source_table, source_id, legal_entity, country, limit = 100, offset = 0 } = req.query;

    let query = `SELECT * FROM tax_lines WHERE 1=1`;
    const params: any[] = [];

    if (source_table) {
      query += ` AND source_table = $${params.length + 1}`;
      params.push(source_table);
    }

    if (source_id) {
      query += ` AND source_id = $${params.length + 1}`;
      params.push(source_id);
    }

    if (legal_entity) {
      query += ` AND legal_entity = $${params.length + 1}`;
      params.push(legal_entity);
    }

    if (country) {
      query += ` AND country = $${params.length + 1}`;
      params.push(country);
    }

    query += ` ORDER BY computed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching tax lines:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/tax/rules
 * Create tax rule
 */
taxRouter.post("/rules", requireRole(["tax_ops", "finance_admin"]), async (req: Request, res: Response) => {
  try {
    const { country, tax_code, description, rate_percent, applies_to, threshold_amount, priority, effective_from, effective_to, metadata } = req.body;

    if (!country || !tax_code || rate_percent === undefined || !applies_to || !effective_from) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const { rows: [rule] } = await pool.query(
      `INSERT INTO tax_rules(
        country, tax_code, description, rate_percent, applies_to,
        threshold_amount, priority, effective_from, effective_to, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        country,
        tax_code,
        description || null,
        rate_percent,
        applies_to || [],
        threshold_amount || null,
        priority || 100,
        effective_from,
        effective_to || null,
        metadata || {},
        req.user?.id,
      ]
    );

    await auditLog({
      action: "tax.rule.create",
      actor_id: req.user?.id,
      resource_type: "tax_rule",
      resource_id: rule.id,
      details: { country, tax_code, rate_percent },
    });

    res.status(201).json(rule);
  } catch (err: any) {
    console.error("Error creating tax rule:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * GET /api/tax/rules
 * List tax rules
 */
taxRouter.get("/rules", requireRole(["finance_ops", "tax_ops", "auditor"]), async (req: Request, res: Response) => {
  try {
    const { country, tax_code } = req.query;

    let query = `SELECT * FROM tax_rules WHERE 1=1`;
    const params: any[] = [];

    if (country) {
      query += ` AND country = $${params.length + 1}`;
      params.push(country);
    }

    if (tax_code) {
      query += ` AND tax_code = $${params.length + 1}`;
      params.push(tax_code);
    }

    query += ` ORDER BY country, priority ASC`;

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching tax rules:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/tax/exemptions
 * Create tax exemption
 */
taxRouter.post("/exemptions", requireRole(["tax_ops", "compliance_admin"]), async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, country, tax_code, reason, valid_from, valid_to, docs } = req.body;

    if (!entity_type || !entity_id || !country || !tax_code) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const { rows: [exemption] } = await pool.query(
      `INSERT INTO tax_exemptions(
        entity_type, entity_id, country, tax_code, reason,
        valid_from, valid_to, docs, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [entity_type, entity_id, country, tax_code, reason || null, valid_from || null, valid_to || null, docs || {}, req.user?.id]
    );

    await auditLog({
      action: "tax.exemption.create",
      actor_id: req.user?.id,
      resource_type: "tax_exemption",
      resource_id: exemption.id,
      details: { entity_type, entity_id, country, tax_code },
    });

    res.status(201).json(exemption);
  } catch (err: any) {
    console.error("Error creating tax exemption:", err);
    if (err.code === "23505") {
      res.status(409).json({ error: "exemption_already_exists" });
    } else {
      res.status(500).json({ error: "server_error" });
    }
  }
});

/**
 * POST /api/tax/reports/generate
 * Generate fiscal report
 */
taxRouter.post("/reports/generate", requireRole(["tax_ops", "finance_admin"]), async (req: Request, res: Response) => {
  try {
    const { report_type, legal_entity, country, period_start, period_end } = req.body;

    if (!report_type || !legal_entity || !country || !period_start || !period_end) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const options = {
      legalEntity: legal_entity,
      reportType: report_type,
      periodStart: new Date(period_start),
      periodEnd: new Date(period_end),
      country,
      requestedBy: req.user?.id || "system",
    };

    let report;
    if (report_type === "vat_return") {
      report = await generateVatReturn(options);
    } else if (report_type === "withholding_summary") {
      report = await generateWithholdingSummary(options);
    } else if (report_type === "tax_statement") {
      report = await generateTaxStatement(options);
    } else {
      return res.status(400).json({ error: "invalid_report_type" });
    }

    res.status(201).json(report);
  } catch (err: any) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "server_error", detail: err.message });
  }
});

/**
 * GET /api/tax/reports
 * List fiscal reports
 */
taxRouter.get("/reports", requireRole(["finance_ops", "tax_ops", "auditor"]), async (req: Request, res: Response) => {
  try {
    const { legal_entity, report_type, status, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM fiscal_reports WHERE 1=1`;
    const params: any[] = [];

    if (legal_entity) {
      query += ` AND legal_entity = $${params.length + 1}`;
      params.push(legal_entity);
    }

    if (report_type) {
      query += ` AND report_type = $${params.length + 1}`;
      params.push(report_type);
    }

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default taxRouter;
