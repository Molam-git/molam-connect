// ============================================================================
// Authentication & Authorization Middleware
// ============================================================================

import { Request, Response, NextFunction } from "express";

/**
 * Simple auth middleware - validates API key or JWT
 * In production: integrate with Molam ID JWT verification
 */
export function authzMiddleware(req: Request & any, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"];
  const authHeader = req.headers.authorization || "";

  // Allow public access with limited permissions
  if (!apiKey && !authHeader.startsWith("Bearer ")) {
    req.user = { id: null, roles: ["public"], lang: "en", currency: "USD" };
    return next();
  }

  // Validate API key (simplified)
  if (apiKey === process.env.FX_API_KEY) {
    req.user = { id: "system", roles: ["finance_ops", "pay_admin"], lang: "en", currency: "USD" };
    return next();
  }

  // In production: verify JWT with Molam ID public key
  req.user = { id: "authenticated", roles: ["public"], lang: "en", currency: "USD" };
  next();
}

/**
 * Role-based access control
 */
export function requireRole(roles: string[]) {
  return (req: any, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles || [];
    const hasRole = roles.some(r => userRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({ error: "insufficient_permissions" });
    }
    next();
  };
}
