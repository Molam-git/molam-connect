/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Authentication middleware (Molam ID JWT)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface MolamUser {
  id: string;
  roles: string[];
  locale: string;
  currency: string;
  country: string;
  tenant_id?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: MolamUser;
    }
  }
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    const publicKey = (process.env.MOLAM_ID_JWT_PUBLIC || "").replace(/\\n/g, "\n");

    if (!publicKey) {
      throw new Error("MOLAM_ID_JWT_PUBLIC not configured");
    }

    const payload: any = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: "molam-id",
    });

    req.user = {
      id: payload.sub,
      roles: payload.roles || [],
      locale: payload.locale || "en-US",
      currency: payload.currency || "USD",
      country: payload.country || "US",
      tenant_id: payload.tenant_id
    };

    next();
  } catch (e: any) {
    console.error("Auth error:", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }
}

