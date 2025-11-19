// ============================================================================
// JWT Authentication & RBAC Middleware
// ============================================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../logger";

export interface AuthUser {
  sub: string;
  roles: string[];
  email?: string;
  country?: string;
  currency?: string;
  lang?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_auth_token" });
    return;
  }

  const token = authHeader.slice(7);
  const publicKey = process.env.MOLAM_ID_JWT_PUBLIC;

  if (!publicKey) {
    logger.error("MOLAM_ID_JWT_PUBLIC not configured");
    res.status(500).json({ error: "server_misconfiguration" });
    return;
  }

  try {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "molam-id",
    }) as any;

    req.user = {
      sub: payload.sub,
      roles: payload.roles || [],
      email: payload.email,
      country: payload.country,
      currency: payload.currency,
      lang: payload.lang || "en",
    };

    logger.info("User authenticated", {
      user_id: req.user.sub,
      roles: req.user.roles,
    });

    next();
  } catch (error: any) {
    logger.warn("JWT validation failed", { error: error.message });
    res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn("Insufficient permissions", {
        user_id: req.user.sub,
        user_roles: req.user.roles,
        required_roles: allowedRoles,
      });
      res.status(403).json({
        error: "forbidden",
        required_roles: allowedRoles,
      });
      return;
    }

    next();
  };
}
