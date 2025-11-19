// ============================================================================
// JWT Authentication Middleware - Molam ID Integration
// ============================================================================

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../logger";

export interface MolamUser {
  sub: string;                    // User ID (Molam ID)
  roles: string[];                // User roles (e.g., 'user', 'pay_admin', 'ops')
  country?: string;               // User country code
  currency?: string;              // User currency preference
  lang?: string;                  // User language preference
  agent_id?: string | null;       // Agent ID if applicable
  email?: string;
  phone?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

/**
 * JWT authentication middleware
 * Validates RS256 JWT from Molam ID service
 */
export function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    logger.warn("Missing or invalid authorization header", {
      path: req.path,
      ip: req.ip,
    });
    return res.status(401).json({ error: "missing_auth_token" });
  }

  const token = authHeader.slice(7);

  try {
    // Get public key from environment (should be loaded from Vault in production)
    const publicKey = process.env.MOLAM_ID_JWT_PUBLIC;

    if (!publicKey) {
      logger.error("MOLAM_ID_JWT_PUBLIC not configured");
      return res.status(500).json({ error: "server_misconfiguration" });
    }

    // Verify JWT with RS256
    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "molam-id",
    }) as any;

    // Attach user to request
    req.user = {
      sub: payload.sub,
      roles: payload.roles || [],
      country: payload.country,
      currency: payload.currency,
      lang: payload.lang || "fr",
      agent_id: payload.agent_id || null,
      email: payload.email,
      phone: payload.phone,
    };

    logger.debug("JWT authenticated", {
      user_id: req.user.sub,
      roles: req.user.roles,
    });

    next();
  } catch (error: any) {
    logger.warn("JWT verification failed", {
      error: error.message,
      path: req.path,
      ip: req.ip,
    });

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "invalid_token" });
    }

    return res.status(401).json({ error: "authentication_failed" });
  }
}

/**
 * Role-based access control middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn("Insufficient permissions", {
        user_id: req.user.sub,
        required_roles: allowedRoles,
        user_roles: req.user.roles,
      });
      return res.status(403).json({ error: "insufficient_permissions" });
    }

    next();
  };
}
