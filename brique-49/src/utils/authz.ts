/**
 * Brique 49 - Taxes & Compliance
 * JWT Authentication & RBAC Middleware
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const MOLAM_ID_JWT_PUBLIC = process.env.MOLAM_ID_JWT_PUBLIC || "";
const SKIP_JWT_VERIFICATION = process.env.SKIP_JWT_VERIFICATION === "true";

export interface MolamUser {
  id: string;
  roles: string[];
  country: string;
  currency: string;
  lang: string;
  legal_entity: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

export function authzMiddleware(req: Request, res: Response, next: NextFunction): void {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  if (SKIP_JWT_VERIFICATION) {
    req.user = {
      id: "dev-user-id",
      roles: ["finance_ops", "tax_ops", "compliance_admin"],
      country: "US",
      currency: "USD",
      lang: "en",
      legal_entity: "MOLAM-GLOBAL",
    };
    return next();
  }

  try {
    const publicKey = MOLAM_ID_JWT_PUBLIC.replace(/\\n/g, "\n");
    const payload = jwt.verify(token, publicKey, { algorithms: ["RS256"] }) as any;

    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
      country: payload.country || "US",
      currency: payload.currency || "USD",
      lang: payload.lang || "en",
      legal_entity: payload.legal_entity || "MOLAM-GLOBAL",
    };

    next();
  } catch (error: any) {
    console.error("JWT verification failed:", error.message);
    res.status(401).json({ error: "invalid_token" });
    return;
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const hasRole = req.user.roles.some((r) => roles.includes(r));

    if (!hasRole) {
      res.status(403).json({
        error: "forbidden",
        required_roles: roles,
        user_roles: req.user.roles,
      });
      return;
    }

    next();
  };
}
