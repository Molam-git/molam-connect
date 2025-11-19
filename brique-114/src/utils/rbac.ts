/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Role-Based Access Control
 */

import { Request, Response, NextFunction } from "express";

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

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
 * Scope by tenant (country/legal entity)
 */
export function scopeByTenant(req: Request, res: Response, next: NextFunction) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // Admins can see all tenants
  if (user.roles.includes("pay_admin") || user.roles.includes("auditor")) {
    return next();
  }

  // Set tenant filter from user context
  req.query.tenant_id = user.tenant_id;
  req.body.tenant_id = user.tenant_id;

  next();
}

