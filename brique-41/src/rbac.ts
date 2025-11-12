/**
 * Brique 41 - Molam Connect
 * Role-Based Access Control (RBAC)
 *
 * Roles:
 * - merchant_admin: Full control over merchant account
 * - merchant_finance: Financial operations (payouts, reports)
 * - connect_platform: Platform/marketplace accounts
 * - pay_admin: Molam Pay administrators
 * - compliance_ops: Compliance & risk operations
 */

import { Request, Response, NextFunction } from "express";
import { pool } from "./db";

/**
 * Require one or more roles
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Check if user has any of the required roles
    const hasRole = user.roles.some((r: string) => roles.includes(r));

    if (!hasRole) {
      return res.status(403).json({
        error: "forbidden",
        required_roles: roles,
        user_roles: user.roles
      });
    }

    next();
  };
}

/**
 * Scope merchant access - ensures merchant users can only access their own accounts
 * Admins (pay_admin, compliance_ops) can access all accounts
 */
export async function scopeMerchant(req: Request, res: Response, next: NextFunction) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Admins can access everything
  if (user.roles.includes("pay_admin") || user.roles.includes("compliance_ops")) {
    return next();
  }

  // Extract account ID from params/query/body
  const accId = req.params.id || req.query.connect_account_id || req.body.connect_account_id;

  if (!accId) {
    return res.status(400).json({ error: "connect_account_id_required" });
  }

  try {
    // Check ownership
    const { rows } = await pool.query(
      `SELECT id FROM connect_accounts WHERE id = $1 AND owner_user_id = $2`,
      [accId, user.id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: "forbidden", message: "Not your account" });
    }

    next();
  } catch (e: any) {
    console.error("Scope check error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}

/**
 * Require specific capability on account
 * Example: requireCapability('card_payments')
 */
export function requireCapability(capability: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Admins bypass capability checks
    if (user.roles.includes("pay_admin")) {
      return next();
    }

    const accId = req.params.id || req.query.connect_account_id || req.body.connect_account_id;

    if (!accId) {
      return res.status(400).json({ error: "connect_account_id_required" });
    }

    try {
      const { rows } = await pool.query(
        `SELECT capabilities FROM connect_accounts WHERE id = $1`,
        [accId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "account_not_found" });
      }

      const capabilities = rows[0].capabilities || {};

      if (!capabilities[capability]) {
        return res.status(403).json({
          error: "capability_not_enabled",
          capability,
          message: `Account does not have '${capability}' enabled`
        });
      }

      next();
    } catch (e: any) {
      console.error("Capability check error:", e);
      return res.status(500).json({ error: "server_error" });
    }
  };
}
