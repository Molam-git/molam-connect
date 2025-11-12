// ============================================================================
// Brique 46 - Billing & Invoicing
// JWT Authentication & RBAC Middleware (Molam ID)
// ============================================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const MOLAM_ID_JWT_PUBLIC = process.env.MOLAM_ID_JWT_PUBLIC || "";
const SKIP_JWT_VERIFICATION = process.env.SKIP_JWT_VERIFICATION === "true";

export interface MolamUser {
  id: string;
  merchantId?: string;
  roles: string[];
  locale: string;
  currency: string;
  country: string;
}

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "missing_authorization_header" });
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "invalid_authorization_format" });
    return;
  }

  const token = authHeader.slice(7);

  // Skip verification in development (DANGEROUS - only for local dev)
  if (SKIP_JWT_VERIFICATION) {
    req.user = {
      id: "dev-user-id",
      merchantId: "dev-merchant-id",
      roles: ["merchant_admin", "billing_ops", "finance_ops"],
      locale: "en-US",
      currency: "USD",
      country: "US",
    };
    return next();
  }

  try {
    const publicKey = MOLAM_ID_JWT_PUBLIC.replace(/\\n/g, "\n");
    const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as any;

    req.user = {
      id: payload.sub || payload.user_id,
      merchantId: payload.merchant_id,
      roles: payload.roles || [],
      locale: payload.locale || "en-US",
      currency: payload.currency || "USD",
      country: payload.country || "US",
    };

    next();
  } catch (error: any) {
    console.error("JWT verification failed:", error.message);
    res.status(401).json({ error: "invalid_token", details: error.message });
    return;
  }
}

// Role-based authorization middleware
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({
        error: "forbidden",
        required_roles: allowedRoles,
        user_roles: req.user.roles,
      });
      return;
    }

    next();
  };
}

// Alias for compatibility
export const authenticateJWT = authMiddleware;
