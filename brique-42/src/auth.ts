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
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    // Get public key from env (RS256)
    const publicKey = (process.env.MOLAM_ID_JWT_PUBLIC || "").replace(/\\n/g, "\n");

    if (!publicKey) {
      throw new Error("MOLAM_ID_JWT_PUBLIC not configured");
    }

    // Verify JWT
    const payload: any = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "molam-id",
    });

    // Extract user info
    req.user = {
      id: payload.sub,
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
    const publicKey = (process.env.MOLAM_ID_JWT_PUBLIC || "").replace(/\\n/g, "\n");
    const payload: any = jwt.verify(token, publicKey, { algorithms: ["RS256"] });

    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
      locale: payload.locale || "en-US",
      currency: payload.currency || "USD",
      country: payload.country || "US",
    };
  } catch (e) {
    // Invalid token, but continue without user
  }

  next();
}
