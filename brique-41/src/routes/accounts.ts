/**
 * Brique 41 - Molam Connect
 * Connect Accounts API routes
 */

import { Router } from "express";
import { pool } from "../db";
import { requireRole, scopeMerchant } from "../rbac";
import { idempo } from "../utils/idempotency";
import { audit, AuditActions } from "../utils/audit";
import { refreshVerification } from "../services/verification";
import { getFeeProfile, setFeeProfile } from "../services/pricing";
import { isValidEmail, isValidUrl, isValidCurrency, isValidCountry, isValidBusinessType, validateRequired } from "../utils/validate";

export const accountsRouter = Router();

/**
 * POST /api/connect/accounts
 * Create a new Connect account (merchant/platform)
 */
accountsRouter.post(
  "/",
  requireRole(["merchant_admin", "pay_admin", "connect_platform"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const {
        external_key,
        wallet_id,
        business_type,
        display_name,
        legal_name,
        country,
        default_currency,
        email,
        phone,
        website,
        category_mcc,
        metadata,
      } = req.body;

      // Validation
      const validation = validateRequired(req.body, [
        "wallet_id",
        "business_type",
        "display_name",
        "country",
        "default_currency",
      ]);

      if (!validation.valid) {
        return res.status(400).json({
          error: "missing_required_fields",
          missing: validation.missing,
        });
      }

      if (!isValidBusinessType(business_type)) {
        return res.status(400).json({ error: "invalid_business_type" });
      }

      if (!isValidCountry(country)) {
        return res.status(400).json({ error: "invalid_country" });
      }

      if (!isValidCurrency(default_currency)) {
        return res.status(400).json({ error: "invalid_currency" });
      }

      if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: "invalid_email" });
      }

      if (website && !isValidUrl(website)) {
        return res.status(400).json({ error: "invalid_website" });
      }

      // Insert function
      const insert = async () => {
        const { rows } = await pool.query(
          `INSERT INTO connect_accounts (
            external_key, owner_user_id, wallet_id, business_type,
            display_name, legal_name, country, default_currency,
            email, phone, website, category_mcc, metadata, onboarding_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
          RETURNING *`,
          [
            external_key || null,
            user.id,
            wallet_id,
            business_type,
            display_name,
            legal_name || null,
            country,
            default_currency,
            email || null,
            phone || null,
            website || null,
            category_mcc || null,
            metadata || {},
          ]
        );

        await audit(rows[0].id, user.id, AuditActions.ACCOUNT_CREATED, {
          wallet_id,
          business_type,
          country,
        });

        return rows[0];
      };

      // Handle idempotency
      const account = external_key
        ? await idempo(pool, external_key, "connect_accounts", "external_key", insert)
        : await insert();

      // Auto-refresh verification from Wallet
      await refreshVerification(account.id);

      res.status(201).json(account);
    } catch (e: any) {
      console.error("[Accounts] Create error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * GET /api/connect/accounts/:id
 * Get Connect account details
 */
accountsRouter.get(
  "/:id",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin", "compliance_ops"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM connect_accounts WHERE id = $1`, [
        req.params.id,
      ]);

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Accounts] Get error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * PATCH /api/connect/accounts/:id
 * Update Connect account
 */
accountsRouter.patch(
  "/:id",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const {
        display_name,
        legal_name,
        email,
        phone,
        website,
        category_mcc,
        metadata,
      } = req.body;

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (display_name) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(display_name);
      }

      if (legal_name) {
        updates.push(`legal_name = $${paramIndex++}`);
        values.push(legal_name);
      }

      if (email) {
        if (!isValidEmail(email)) {
          return res.status(400).json({ error: "invalid_email" });
        }
        updates.push(`email = $${paramIndex++}`);
        values.push(email);
      }

      if (phone) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(phone);
      }

      if (website) {
        if (!isValidUrl(website)) {
          return res.status(400).json({ error: "invalid_website" });
        }
        updates.push(`website = $${paramIndex++}`);
        values.push(website);
      }

      if (category_mcc) {
        updates.push(`category_mcc = $${paramIndex++}`);
        values.push(category_mcc);
      }

      if (metadata) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(metadata);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }

      updates.push(`updated_at = now()`);
      values.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE connect_accounts SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(req.params.id, user.id, AuditActions.ACCOUNT_UPDATED, req.body);

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Accounts] Update error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/capabilities
 * Update account capabilities (Ops only)
 */
accountsRouter.post(
  "/:id/capabilities",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const capabilities = req.body || {};

      const { rows } = await pool.query(
        `UPDATE connect_accounts
         SET capabilities = COALESCE(capabilities, '{}'::jsonb) || $1::jsonb,
             updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(capabilities), req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(req.params.id, user.id, AuditActions.CAPABILITIES_UPDATED, { capabilities });

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Accounts] Capabilities error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/fee_profile
 * Set custom fee profile (Finance/Ops only)
 */
accountsRouter.post(
  "/:id/fee_profile",
  requireRole(["pay_admin", "compliance_ops"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const { name, fees } = req.body;

      if (!name || !fees) {
        return res.status(400).json({ error: "name_and_fees_required" });
      }

      await setFeeProfile(req.params.id, name, fees);
      await audit(req.params.id, user.id, AuditActions.FEE_PROFILE_SET, { name, fees });

      res.json({ success: true, name, fees });
    } catch (e: any) {
      console.error("[Accounts] Fee profile error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/fee_profile
 * Get fee profile for account
 */
accountsRouter.get(
  "/:id/fee_profile",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const fees = await getFeeProfile(req.params.id);
      res.json(fees);
    } catch (e: any) {
      console.error("[Accounts] Get fee profile error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/refresh_verification
 * Sync verification status with Wallet (B33)
 */
accountsRouter.post(
  "/:id/refresh_verification",
  requireRole(["pay_admin", "compliance_ops", "merchant_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const result = await refreshVerification(req.params.id);

      await audit(req.params.id, user.id, AuditActions.VERIFICATION_REFRESHED, result);

      res.json(result);
    } catch (e: any) {
      console.error("[Accounts] Refresh verification error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/approve
 * Approve account for production (Compliance only)
 */
accountsRouter.post(
  "/:id/approve",
  requireRole(["compliance_ops", "pay_admin"]),
  async (req: any, res) => {
    try {
      const user = req.user;

      const { rows } = await pool.query(
        `UPDATE connect_accounts
         SET onboarding_status = 'approved', updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(req.params.id, user.id, AuditActions.ACCOUNT_APPROVED, {});

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Accounts] Approve error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * POST /api/connect/accounts/:id/reject
 * Reject account (Compliance only)
 */
accountsRouter.post(
  "/:id/reject",
  requireRole(["compliance_ops", "pay_admin"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const { reason } = req.body;

      const { rows } = await pool.query(
        `UPDATE connect_accounts
         SET onboarding_status = 'rejected', updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(req.params.id, user.id, AuditActions.ACCOUNT_REJECTED, { reason });

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[Accounts] Reject error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/accounts
 * List accounts (with pagination)
 */
accountsRouter.get(
  "/",
  requireRole(["pay_admin", "compliance_ops", "merchant_admin"]),
  async (req: any, res) => {
    try {
      const user = req.user;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      let query = `SELECT * FROM connect_accounts`;
      const params: any[] = [];

      // Merchants can only see their own accounts
      if (!user.roles.includes("pay_admin") && !user.roles.includes("compliance_ops")) {
        query += ` WHERE owner_user_id = $1`;
        params.push(user.id);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json({
        data: rows,
        pagination: {
          limit,
          offset,
          count: rows.length,
        },
      });
    } catch (e: any) {
      console.error("[Accounts] List error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
