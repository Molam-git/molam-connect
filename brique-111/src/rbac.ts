/**
 * Brique 111 - Merchant Config UI
 * Role-Based Access Control (RBAC)
 *
 * Roles:
 * - merchant_admin: Full control over merchant account
 * - merchant_finance: Financial operations
 * - pay_admin: Molam Pay administrators
 * - compliance_ops: Compliance & risk operations
 * - sira: Sira AI system (auto-healing)
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
 * Scope merchant access - ensures merchant users can only access their own data
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

  // For merchant users, ensure they can only access their own merchant_id
  if (!user.merchantId) {
    return res.status(403).json({ error: "forbidden", message: "No merchant_id associated with user" });
  }

  // Set merchant_id from user context
  req.body.merchant_id = user.merchantId;
  req.params.merchant_id = user.merchantId;

  next();
}


