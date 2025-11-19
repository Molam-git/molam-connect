// ============================================================================
// Multi-Channel Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { logger } from "../logger";
import {
  sendMultiChannelApproval,
  sendPrimaryChannelApproval,
} from "../services/multichannelOrchestrator";
import { pool } from "../db";

export const multichannelRouter = Router();

// ============================================================================
// POST /api/multichannel/send - Envoyer sur tous les canaux
// ============================================================================
multichannelRouter.post("/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Validation
    if (!data.approval_request_id || !data.recipient_id || !data.recipient_email) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const result = await sendMultiChannelApproval(data);

    res.json({
      ok: result.success,
      channels_sent: result.channels_sent,
      channels_failed: result.channels_failed,
    });
  } catch (error: any) {
    logger.error("Multi-channel send failed", { error: error.message });
    res.status(500).json({ error: "send_failed" });
  }
});

// ============================================================================
// POST /api/multichannel/send-primary - Envoyer sur canal primaire uniquement
// ============================================================================
multichannelRouter.post("/send-primary", async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;

    if (!data.approval_request_id || !data.recipient_id) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const result = await sendPrimaryChannelApproval(data);

    res.json({
      ok: result.success,
      channel: result.channel,
    });
  } catch (error: any) {
    logger.error("Primary channel send failed", { error: error.message });
    res.status(500).json({ error: "send_failed" });
  }
});

// ============================================================================
// GET /api/multichannel/delivery-log/:approval_request_id - Logs de livraison
// ============================================================================
multichannelRouter.get(
  "/delivery-log/:approval_request_id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { approval_request_id } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM channel_delivery_log
         WHERE approval_request_id = $1
         ORDER BY attempted_at DESC`,
        [approval_request_id]
      );

      res.json({ ok: true, delivery_log: rows });
    } catch (error: any) {
      logger.error("Failed to fetch delivery log", { error: error.message });
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// ============================================================================
// POST /api/multichannel/register-device - Enregistrer device token
// ============================================================================
multichannelRouter.post("/register-device", async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, channel, identifier, primary } = req.body;

    if (!user_id || !channel || !identifier) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // If setting as primary, unset other primaries
    if (primary) {
      await pool.query(
        `UPDATE user_channel_identifiers
         SET primary_channel = false
         WHERE user_id = $1 AND channel = $2`,
        [user_id, channel]
      );
    }

    // Upsert identifier
    await pool.query(
      `INSERT INTO user_channel_identifiers(user_id, channel, identifier, primary_channel, enabled)
       VALUES($1, $2, $3, $4, true)
       ON CONFLICT (user_id, channel, identifier)
       DO UPDATE SET primary_channel = EXCLUDED.primary_channel, enabled = true, updated_at = now()`,
      [user_id, channel, identifier, primary || false]
    );

    logger.info("Device registered", { user_id, channel, identifier });

    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Failed to register device", { error: error.message });
    res.status(500).json({ error: "registration_failed" });
  }
});

// ============================================================================
// GET /api/multichannel/stats - Statistiques multi-canaux
// ============================================================================
multichannelRouter.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query;

    const { rows: channelStats } = await pool.query(
      `SELECT
        channel,
        status,
        COUNT(*) as count
      FROM channel_delivery_log
      WHERE attempted_at >= COALESCE($1::timestamptz, now() - interval '24 hours')
        AND attempted_at <= COALESCE($2::timestamptz, now())
      GROUP BY channel, status
      ORDER BY channel, status`,
      [from || null, to || null]
    );

    const { rows: clickStats } = await pool.query(
      `SELECT
        channel,
        COUNT(*) as clicks,
        COUNT(DISTINCT approval_request_id) as unique_requests
      FROM email_click_audit eca
      JOIN channel_delivery_log cdl ON eca.token_id = cdl.provider_message_id::uuid
      WHERE eca.clicked_at >= COALESCE($1::timestamptz, now() - interval '24 hours')
        AND eca.clicked_at <= COALESCE($2::timestamptz, now())
      GROUP BY channel`,
      [from || null, to || null]
    );

    res.json({
      ok: true,
      channel_stats: channelStats,
      click_stats: clickStats,
    });
  } catch (error: any) {
    logger.error("Failed to fetch stats", { error: error.message });
    res.status(500).json({ error: "internal_error" });
  }
});
