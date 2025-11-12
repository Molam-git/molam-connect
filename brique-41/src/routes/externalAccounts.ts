/**
 * Brique 41 - Molam Connect
 * External Accounts API routes (payout destinations)
 */

import { Router } from "express";
import { pool } from "../db";
import { requireRole, scopeMerchant } from "../rbac";
import { audit, AuditActions } from "../utils/audit";
import { isValidExternalAccountType, isValidCurrency, validateRequired } from "../utils/validate";

export const externalAccountsRouter = Router({ mergeParams: true });

/**
 * POST /api/connect/accounts/:id/external_accounts
 * Add external payout account (bank or wallet)
 */
externalAccountsRouter.post(
  "/",
  requireRole(["merchant_admin", "pay_admin", "merchant_finance"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const connectAccountId = req.params.id;
      const { type, bank_profile_id, beneficiary, currency, is_default } = req.body;

      // Validation
      const validation = validateRequired(req.body, ["type", "beneficiary", "currency"]);

      if (!validation.valid) {
        return res.status(400).json({
          error: "missing_required_fields",
          missing: validation.missing,
        });
      }

      if (!isValidExternalAccountType(type)) {
        return res.status(400).json({ error: "invalid_type" });
      }

      if (!isValidCurrency(currency)) {
        return res.status(400).json({ error: "invalid_currency" });
      }

      if (type === "bank" && !bank_profile_id) {
        return res.status(400).json({ error: "bank_profile_id_required_for_bank_type" });
      }

      // If setting as default, unset previous default
      if (is_default) {
        await pool.query(
          `UPDATE connect_external_accounts
           SET is_default = false
           WHERE connect_account_id = $1`,
          [connectAccountId]
        );
      }

      // Insert external account
      const { rows } = await pool.query(
        `INSERT INTO connect_external_accounts (
          connect_account_id, type, bank_profile_id, beneficiary, currency, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [connectAccountId, type, bank_profile_id || null, beneficiary, currency, !!is_default]
      );

      await audit(connectAccountId, user.id, AuditActions.EXTERNAL_ACCOUNT_ADDED, {
        type,
        currency,
      });

      res.status(201).json(rows[0]);
    } catch (e: any) {
      console.error("[ExternalAccounts] Create error:", e);
      res.status(500).json({ error: "server_error", detail: e.message });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/external_accounts
 * List external accounts for Connect account
 */
externalAccountsRouter.get(
  "/",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const connectAccountId = req.params.id;

      const { rows } = await pool.query(
        `SELECT * FROM connect_external_accounts
         WHERE connect_account_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [connectAccountId]
      );

      res.json(rows);
    } catch (e: any) {
      console.error("[ExternalAccounts] List error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * GET /api/connect/accounts/:id/external_accounts/:externalId
 * Get specific external account
 */
externalAccountsRouter.get(
  "/:externalId",
  requireRole(["merchant_admin", "merchant_finance", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const { id: connectAccountId, externalId } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM connect_external_accounts
         WHERE id = $1 AND connect_account_id = $2`,
        [externalId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[ExternalAccounts] Get error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * PATCH /api/connect/accounts/:id/external_accounts/:externalId
 * Update external account
 */
externalAccountsRouter.patch(
  "/:externalId",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, externalId } = req.params;
      const { beneficiary, is_default, status } = req.body;

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (beneficiary) {
        updates.push(`beneficiary = $${paramIndex++}`);
        values.push(beneficiary);
      }

      if (status) {
        if (!["active", "inactive"].includes(status)) {
          return res.status(400).json({ error: "invalid_status" });
        }
        updates.push(`status = $${paramIndex++}`);
        values.push(status);
      }

      if (is_default !== undefined) {
        if (is_default) {
          // Unset previous default
          await pool.query(
            `UPDATE connect_external_accounts
             SET is_default = false
             WHERE connect_account_id = $1`,
            [connectAccountId]
          );
        }
        updates.push(`is_default = $${paramIndex++}`);
        values.push(is_default);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }

      updates.push(`updated_at = now()`);
      values.push(externalId, connectAccountId);

      const { rows } = await pool.query(
        `UPDATE connect_external_accounts
         SET ${updates.join(", ")}
         WHERE id = $${paramIndex} AND connect_account_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.EXTERNAL_ACCOUNT_UPDATED, req.body);

      res.json(rows[0]);
    } catch (e: any) {
      console.error("[ExternalAccounts] Update error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);

/**
 * DELETE /api/connect/accounts/:id/external_accounts/:externalId
 * Remove external account
 */
externalAccountsRouter.delete(
  "/:externalId",
  requireRole(["merchant_admin", "pay_admin"]),
  scopeMerchant,
  async (req: any, res) => {
    try {
      const user = req.user;
      const { id: connectAccountId, externalId } = req.params;

      const { rows } = await pool.query(
        `DELETE FROM connect_external_accounts
         WHERE id = $1 AND connect_account_id = $2
         RETURNING *`,
        [externalId, connectAccountId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      await audit(connectAccountId, user.id, AuditActions.EXTERNAL_ACCOUNT_REMOVED, {
        external_id: externalId,
      });

      res.json({ success: true, deleted: rows[0] });
    } catch (e: any) {
      console.error("[ExternalAccounts] Delete error:", e);
      res.status(500).json({ error: "server_error" });
    }
  }
);
