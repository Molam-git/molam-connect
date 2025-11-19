// ============================================================================
// Treasury Exports API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";
import { generateExport } from "../services/export-generator";
import { queryAuditLogs } from "../services/audit-logger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const exportsRouter = Router();

/**
 * POST /api/treasury/exports - Create export job
 */
exportsRouter.post("/", async (req: any, res) => {
  const { format, period_start, period_end } = req.body;
  const userId = req.user?.id || "system";

  try {
    const { rows: [job] } = await pool.query(
      `INSERT INTO treasury_export_jobs(format, period_start, period_end, requested_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [format, period_start, period_end, userId]
    );

    // Trigger async processing
    generateExport(job.id).catch(console.error);

    res.json(job);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/exports - List export jobs
 */
exportsRouter.get("/", async (req: any, res) => {
  const limit = Number(req.query.limit) || 50;
  const status = req.query.status;

  try {
    let query = `SELECT * FROM treasury_export_jobs WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      query += ` AND status=$${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/exports/:id - Get export details
 */
exportsRouter.get("/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows: [job] } = await pool.query(
      `SELECT * FROM treasury_export_jobs WHERE id=$1`,
      [id]
    );

    if (!job) {
      return res.status(404).json({ error: "export_not_found" });
    }

    res.json(job);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/exports/:id/download - Download export file
 */
exportsRouter.get("/:id/download", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows: [job] } = await pool.query(
      `SELECT * FROM treasury_export_jobs WHERE id=$1`,
      [id]
    );

    if (!job || job.status !== 'completed') {
      return res.status(404).json({ error: "export_not_ready" });
    }

    // TODO: Generate presigned S3 URL or stream file
    res.json({
      download_url: `/api/treasury/exports/${id}/file`,
      checksum: job.checksum,
      size: job.file_size_bytes
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/audit-logs - Query audit logs
 */
exportsRouter.get("/audit-logs", async (req: any, res) => {
  const { event_type, start_date, end_date, actor, limit } = req.query;

  try {
    const logs = await queryAuditLogs({
      eventType: event_type as string,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined,
      actor: actor as string,
      limit: limit ? Number(limit) : undefined
    });

    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/exports/stats - Export statistics
 */
exportsRouter.get("/stats", async (req: any, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='running') as running,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        SUM(file_size_bytes) FILTER (WHERE status='completed') as total_bytes
      FROM treasury_export_jobs
      WHERE created_at > now() - interval '30 days'
    `);

    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
