/**
 * Brique 41 - Molam Connect
 * Authentication middleware (Molam ID JWT)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface MolamUser {
  id: string;
  roles: string[];
  locale: string;      // e.g. "fr-SN", "en-US", "fr-FR"
  currency: string;
  country: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

/**
 * Auth middleware - validates Molam ID JWT token
 * Expects: Authorization: Bearer <token>
 */
export function auth(req: Request, res: Response, next: NextFunction) {
  // Skip JWT verification in development mode if configured
  if (process.env.SKIP_JWT_VERIFICATION === "true") {
    req.user = {
      id: "dev_user",
      roles: ["developer"],
      locale: "en-US",
      currency: "USD",
      country: "US",
    };
    return next();
  }

  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    // Get JWT secret from env (HS256) - shared with Molam ID
    const jwtSecret = process.env.MOLAM_ID_JWT_SECRET;

    if (!jwtSecret) {
      throw new Error("MOLAM_ID_JWT_SECRET not configured");
    }

    // Verify JWT with HS256 (same as Molam ID)
    const payload: any = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
    });

    // Extract user info from Molam ID token
    req.user = {
      id: payload.sub || payload.userId || payload.id,
      roles: payload.roles || [],
      locale: payload.locale || "en-US",
      currency: payload.currency || "USD",
      country: payload.country || "US",
    };

    next();
  } catch (e: any) {
    console.error("Auth error:", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }
}

/**
 * Optional auth - doesn't fail if no token, but validates if present
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";

  if (!token) {
    return next();
  }

  try {
    const jwtSecret = process.env.MOLAM_ID_JWT_SECRET;
    if (jwtSecret) {
      const payload: any = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

      req.user = {
        id: payload.sub || payload.userId || payload.id,
        roles: payload.roles || [],
        locale: payload.locale || "en-US",
        currency: payload.currency || "USD",
        country: payload.country || "US",
      };
    }
  } catch (e) {
    // Invalid token, but continue without user
  }

  next();
}
